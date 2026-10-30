import { useState, useEffect } from "react";
import Layout from "./Layout";
import Login from "./Login";
import AdminUsuarios from "./AdminUsuarios";
import Inventory from "./Inventory";
import Proveedores from "./Proveedores";
import Semielaborados from "./Semielaborados";
import Reflectivas from "./Reflectivas";
import Metricas from "./Metricas";
import Connie from "./Connie";
import Home from "./Home";
import Ingenieria from "./Ingenieria";
import PlanificacionProduccion from "./PlanificacionProduccion";
import CargaProduccion from "./CargaProduccion";
import ComercialIA from "./ComercialIA";
import ProduccionPlanta from "./ProduccionPlanta";
import SolicitudesInternas from "./SolicitudesInternas";
import DespacharPedidos from "./DespacharPedidos";
import Pedidos from "./Pedidos";
import FicheroModule from "./FicheroModule";
import SimuladorLogistica from "./SimuladorLogistica";
import LaboratorioEnsamblaje from "./LaboratorioEnsamblaje";
import LaboratorioAR from "./LaboratorioAR";
import VisorAR from "./VisorAR";
import SolicitudesCompraModule from "./SolicitudesCompraModule";
import FirmaSolicitudPublica from "./FirmaSolicitudPublica";
import { itemPorId } from "./menu";

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

function App() {
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
      if (
        activeModule === "inicio" ||
        activeModule === "visor-ar" ||
        activeModule === "lab-ar" ||
        activeModule === "lab-ensamblaje" ||
        activeModule === "simulador-carga"
      ) {
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

  const handleLoginSuccess = (user) => {
    setUsuarioActual(user);
    localStorage.setItem("usuario_conoflex", JSON.stringify(user));
  };

  const handleLogout = () => {
    setUsuarioActual(null);
    localStorage.removeItem("usuario_conoflex");
    localStorage.removeItem("token");
    sessionStorage.clear();
    window.history.replaceState({}, document.title, "/");
    setActiveModule("inicio");
  };

  if (firmarScId) {
    return (
      <FirmaSolicitudPublica
        id={firmarScId}
        rol={firmarRol}
        onVolver={() => (window.location.href = "/")}
      />
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
      {activeModule === "simulador-carga" && <SimuladorLogistica />}
      {activeModule === "lab-ensamblaje" && <LaboratorioEnsamblaje />}
      {activeModule === "lab-ar" && <LaboratorioAR />}
      {activeModule === "visor-ar" && <VisorAR />}
      {/* ======================================================== */}

      {hasAccess("metricas") && activeModule === "metricas" && (
        <Metricas key={reloadKey} />
      )}

      {hasAccess("connie") && activeModule === "connie" && <Connie />}

      {hasAccess("ingenieria") && activeModule === "ingenieria" && (
        <Ingenieria />
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
    </Layout>
  );
}

export default App;
