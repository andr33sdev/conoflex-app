import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { Loader2 } from "lucide-react";
import { prepararRecolor } from "./recolorTextura";

/** Visor 3D de un modelo .glb: se gira con el dedo/mouse y se pinta del color pedido. */
export default function Visor3D({ archivo, color, alto = 280 }) {
  const caja = useRef(null);
  const recolor = useRef(null);
  const colorActual = useRef(color);
  const [estado, setEstado] = useState("cargando"); // cargando | listo | error
  useEffect(() => { colorActual.current = color; }, [color]);

  useEffect(() => {
    const el = caja.current;
    let vivo = true;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.1, 4.0);
    const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(2, 3, 4);
    scene.add(new THREE.AmbientLight(0xffffff, 1.1), sol);
    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enablePan = false; controles.enableZoom = false; controles.enableDamping = true;
    controles.minPolarAngle = Math.PI * 0.3; controles.maxPolarAngle = Math.PI * 0.62;
    controles.autoRotate = true; controles.autoRotateSpeed = 1.2;
    controles.addEventListener("start", () => { controles.autoRotate = false; });

    const ajustar = () => {
      const w = el.clientWidth || 300;
      renderer.setSize(w, alto, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = `${alto}px`;
      camera.aspect = w / alto; camera.updateProjectionMatrix();
    };
    ajustar();
    const ro = new ResizeObserver(ajustar); ro.observe(el);

    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(archivo, (gltf) => {
      if (!vivo) return;
      let mat = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mat) mat = o.material; });
      if (mat) { recolor.current = prepararRecolor(mat); recolor.current.pintar(colorActual.current); }
      scene.add(gltf.scene);
      setEstado("listo");
    }, undefined, () => { if (vivo) setEstado("error"); });

    const dibujar = () => { raf = requestAnimationFrame(dibujar); controles.update(); renderer.render(scene, camera); };
    dibujar();
    return () => {
      vivo = false; cancelAnimationFrame(raf); ro.disconnect(); controles.dispose();
      recolor.current?.liberar(); recolor.current = null;
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose(); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [archivo, alto]);

  useEffect(() => { recolor.current?.pintar(color); }, [color]);

  return (
    <div className="relative rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.12] to-white/[0.04] overflow-hidden" style={{ minHeight: alto }}>
      <div ref={caja} className="w-full" style={{ height: alto }} />
      {estado === "cargando" && <div className="absolute inset-0 grid place-items-center text-zinc-500"><Loader2 size={22} className="animate-spin" /></div>}
      {estado === "error" && <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500 px-6 text-center">No se pudo cargar el modelo 3D.</div>}
      {estado === "listo" && <p className="absolute top-2 inset-x-0 text-center text-[11px] text-zinc-600 pointer-events-none">Arrastrá para girarlo</p>}
    </div>
  );
}
