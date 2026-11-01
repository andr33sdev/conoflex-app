import { useState, useEffect, lazy, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import Layout from "./Layout";
import Login from "./Login";
const AdminUsuarios = lazy(() => import("./AdminUsuarios"));
const Inventory = lazy(() => import("./Inventory"));
const Proveedores = lazy(() => import("./Proveedores"));
const Semielaborados = lazy(() => import("./Semielaborados"));
const Reflectivas = lazy(() => import("./Reflectivas"));
const Metricas = lazy(() => import("./Metricas"));
const Connie = lazy(() => import("./Connie"));
import Home from "./Home";
const Ingenieria = lazy(() => import("./Ingenieria"));
const PlanificacionProduccion = lazy(() => import("./PlanificacionProduccion"));
const CargaProduccion = lazy(() => import("./CargaProduccion"));
const ComercialIA = lazy(() => import("./ComercialIA"));
const ProduccionPlanta = lazy(() => import("./ProduccionPlanta"));
const SolicitudesInternas = lazy(() => import("./SolicitudesInternas"));
const DespacharPedidos = lazy(() => import("./DespacharPedidos"));
const Pedidos = lazy(() => import("./Pedidos"));
const FicheroModule = lazy(() => import("./FicheroModule"));
const SimuladorLogistica = lazy(() => import("./SimuladorLogistica"));
const LaboratorioEnsamblaje = lazy(() => import("./LaboratorioEnsamblaje"));
const LaboratorioAR = lazy(() => import("./LaboratorioAR"));
const VisorAR = lazy(() => import("./VisorAR"));
const SolicitudesCompraModule = lazy(() => import("./SolicitudesCompraModule"));
const FirmaSolicitudPublica = lazy(() => import("./FirmaSolicitudPublica"));
const Agentes = lazy(() => import("./Agentes"));
import { itemPorId, veLaboratorio, tieneAlgunAgente } from "./menu";
import PantallaCarga, { CargandoModulo } from "./PantallaCarga";
import { olvidarUsuarioTema, sincronizarTema } from "./tema";

// Cada módulo se descarga cuando se lo abre; mientras tanto se muestra el logo de carga.
// El módulo de la dirección actual se precarga durante la pantalla de inicio.
const PRECARGA = {
  "admin-usuarios": () => import("./AdminUsuarios"),
  "materias-primas": () => import("./Inventory"),
  proveedores: () => import("./Proveedores"),
  semielaborados: () => import("./Semielaborados"),
  reflectivas: () => import("./Reflectivas"),
  metricas: () => import("./Metricas"),
  connie: () => import("./Connie"),
  ingenieria: () => import("./Ingenieria"),
  planificacion: () => import("./PlanificacionProduccion"),
  "carga-produccion": () => import("./CargaProduccion"),
  comercial: () => import("./ComercialIA"),
  "planta-online": () => import("./ProduccionPlanta"),
  "solicitudes-internas": () => import("./SolicitudesInternas"),
  "despachar-pedidos": () => import("./DespacharPedidos"),
  pedidos: () => import("./Pedidos"),
  "control-asistencia": () => import("./FicheroModule"),
  "simulador-carga": () => import("./SimuladorLogistica"),
  "lab-ensamblaje": () => import("./LaboratorioEnsamblaje"),
  "lab-ar": () => import("./LaboratorioAR"),
  "visor-ar": () => import("./VisorAR"),
  "solicitudes-compra": () => import("./SolicitudesCompraModule"),
  agentes: () => import("./Agentes"),
};

// Cada módulo tiene su propia ruta: /<id-del-módulo> (el inicio es "/").
// Se usa la History API directamente, así que no cambia nada de cómo se renderiza la app.
const rutaDe = (id) => (id === "inicio" ? "/" : `/${id}`);

function moduloDesdeUrl() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  // Retorno del login de Google (Comercial) y enlaces viejos de planificación.
  if (params.get("status") === "conectado" || params.get("module") === "comercial") return "comercial";
  if (path.startsWith("/plan/") || params.has("ot")) return "planificacion";
  const id = path.slice(1).split("/")[0];
  if (id && itemPorId(id)) return id;
  return "inicio";
}

function AppInterna() {
  const [usuarioActual, setUsuarioActual] = useState(() => {
    const savedUser = localStorage.getItem("usuario_conoflex");
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [activeModule, setActiveModule] = useState(moduloDesdeUrl);

  // Cambia de módulo y actualiza la dirección (con "reemplazar" no suma un paso al historial).
  const irA = (id, reemplazar = false) => {
    const destino = rutaDe(id);
    if (window.location.pathname !== destino || window.location.search) {
      window.history[reemplazar ? "replaceState" : "pushState"]({}, document.title, destino);
    }
    setActiveModule(id);
  };

  // Si abren desde el link de WhatsApp (ej: /?firmar_sc=258&rol=gerente)
  const params = new URLSearchParams(window.location.search);
  const firmarScId = params.get("firmar_sc");
  const firmarRol = params.get("rol") || "gerente";

  // Botones atrás/adelante del navegador.
  useEffect(() => {
    const alCambiarUrl = () => setActiveModule(moduloDesdeUrl());
    window.addEventListener("popstate", alCambiarUrl);
    return () => window.removeEventListener("popstate", alCambiarUrl);
  }, []);

  // Si se entró por una dirección vieja o sin ruta (ej: "/?module=comercial"), la deja en la ruta del módulo.
  useEffect(() => {
    const destino = rutaDe(activeModule);
    if (window.location.pathname !== destino && !window.location.pathname.startsWith("/plan/")) {
      window.history.replaceState({}, document.title, destino + window.location.search);
    }
  }, [activeModule]);

  useEffect(() => {
    if (usuarioActual && usuarioActual.rol?.toUpperCase() !== "ADMIN") {
      // EXCEPCIÓN: Permitir siempre el acceso a los módulos experimentales 3D/AR
      const esLab = ["visor-ar", "lab-ar", "lab-ensamblaje", "simulador-carga"].includes(activeModule);
      if (activeModule === "inicio" || (activeModule === "agentes" && tieneAlgunAgente(usuarioActual)) || (esLab && veLaboratorio(usuarioActual))) {
        return;
      }

      const tienePermiso =
        usuarioActual.permisos?.includes(activeModule) ||
        usuarioActual.permisos?.includes("*");
      if (!tienePermiso) {
        irA(usuarioActual.permisos?.[0] || "materias-primas", true);
      }
    }
  }, [usuarioActual, activeModule]);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReloadSheets = async () => {
    if (activeModule !== "semielaborados") return;

    setIsReloading(true);
    try {
      const res = await fetch("/api/semielaborados/recargar-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        setReloadKey((prev) => prev + 1);
      }
    } catch (err) {
      console.error("Error al recargar desde Google Sheets:", err);
    } finally {
      setIsReloading(false);
    }
  };

  // El tema (claro/oscuro) es del usuario y vive en el servidor: se aplica en cualquier dispositivo apenas hay sesión.
  useEffect(() => {
    sincronizarTema(usuarioActual);
  }, [usuarioActual]);

  const handleLoginSuccess = (user) => {
    setUsuarioActual(user);
    localStorage.setItem("usuario_conoflex", JSON.stringify(user));
  };

  const handleLogout = () => {
    setUsuarioActual(null);
    olvidarUsuarioTema();
    localStorage.removeItem("usuario_conoflex");
    localStorage.removeItem("token");
    sessionStorage.clear();
    window.history.replaceState({}, document.title, "/");
    setActiveModule("inicio");
  };

  if (firmarScId) {
    return (
      <Suspense fallback={<CargandoModulo />}>
        <FirmaSolicitudPublica
          id={firmarScId}
          rol={firmarRol}
          onVolver={() => (window.location.href = "/")}
        />
      </Suspense>
    );
  }

  if (!usuarioActual) {
    return <Login onLogin={handleLoginSuccess} />;
  }

  const hasAccess = (moduleId) => {
    if (usuarioActual.rol?.toUpperCase() === "ADMIN") return true;
    return (
      usuarioActual.permisos?.includes(moduleId) ||
      usuarioActual.permisos?.includes("*")
    );
  };

  return (
    <Layout
      activeModule={activeModule}
      setActiveModule={irA}
      onOpenUploadModal={() => setIsUploadModalOpen(true)}
      onReloadSheets={handleReloadSheets}
      isReloading={isReloading}
      usuarioActual={usuarioActual}
      onLogout={handleLogout}
    >
      {activeModule === "inicio" && (
        <Home usuarioActual={usuarioActual} onIr={irA} />
      )}

      <Suspense fallback={<CargandoModulo />}>

      {usuarioActual.rol?.toUpperCase() === "ADMIN" &&
        activeModule === "admin-usuarios" && <AdminUsuarios />}

      {hasAccess("control-asistencia") &&
        activeModule === "control-asistencia" && <FicheroModule />}

      {hasAccess("materias-primas") && activeModule === "materias-primas" && (
        <Inventory
          key={`mp-${reloadKey}`}
          isUploadModalOpen={isUploadModalOpen}
          onCloseUploadModal={() => setIsUploadModalOpen(false)}
        />
      )}

      {hasAccess("proveedores") && activeModule === "proveedores" && (
        <Proveedores />
      )}

      {hasAccess("solicitudes-compra") &&
        activeModule === "solicitudes-compra" && <SolicitudesCompraModule />}

      {hasAccess("semielaborados") && activeModule === "semielaborados" && (
        <Semielaborados
          key={`se-${reloadKey}`}
          isUploadModalOpen={isUploadModalOpen}
          onCloseUploadModal={() => setIsUploadModalOpen(false)}
        />
      )}

      {hasAccess("solicitudes-internas") &&
        activeModule === "solicitudes-internas" && (
          <SolicitudesInternas usuarioActual={usuarioActual} />
        )}

      {hasAccess("reflectivas") && activeModule === "reflectivas" && (
        <Reflectivas key={reloadKey} usuarioActual={usuarioActual} />
      )}

      {/* ========================================================
          MÓDULOS LIBERADOS PARA PRUEBAS (SIN hasAccess) 
          ======================================================== */}
      {veLaboratorio(usuarioActual) && (
        <>
          {activeModule === "simulador-carga" && <SimuladorLogistica />}
          {activeModule === "lab-ensamblaje" && <LaboratorioEnsamblaje />}
          {activeModule === "lab-ar" && <LaboratorioAR />}
          {activeModule === "visor-ar" && <VisorAR />}
        </>
      )}
      {/* ======================================================== */}

      {hasAccess("metricas") && activeModule === "metricas" && (
        <Metricas key={reloadKey} />
      )}

      {activeModule === "agentes" && tieneAlgunAgente(usuarioActual) && (
        <Agentes usuarioActual={usuarioActual} />
      )}

      {hasAccess("connie") && activeModule === "connie" && <Connie />}

      {hasAccess("ingenieria") && activeModule === "ingenieria" && (
        <Ingenieria usuarioActual={usuarioActual} />
      )}

      {hasAccess("planificacion") && activeModule === "planificacion" && (
        <PlanificacionProduccion />
      )}

      {hasAccess("pedidos") && activeModule === "pedidos" && (
        <Pedidos usuarioActual={usuarioActual} />
      )}

      {activeModule === "despachar-pedidos" && (
        <DespacharPedidos usuarioActual={usuarioActual} />
      )}

      {hasAccess("carga-produccion") && activeModule === "carga-produccion" && (
        <CargaProduccion />
      )}

      {hasAccess("comercial") && activeModule === "comercial" && (
        <ComercialIA />
      )}

      {hasAccess("planta-online") && activeModule === "planta-online" && (
        <ProduccionPlanta />
      )}
      </Suspense>
    </Layout>
  );
}

// Pantalla de carga con el logo: dura un mínimo (para que se vea completa) y espera a que el módulo actual esté descargado.
function App() {
  const [mostrarCarga, setMostrarCarga] = useState(true);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    const minimo = new Promise((r) => setTimeout(r, 1500));
    const modulo = Promise.resolve(PRECARGA[moduloDesdeUrl()]?.()).catch(() => {});
    Promise.all([minimo, modulo]).then(() => vivo && setListo(true));
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <>
      <AppInterna />
      <AnimatePresence>{mostrarCarga && <PantallaCarga listo={listo} onTerminar={() => setMostrarCarga(false)} />}</AnimatePresence>
    </>
  );
}

export default App;
