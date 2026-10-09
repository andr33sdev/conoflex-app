import { useState, useEffect } from "react";
import Layout from "./Layout";
import Login from "./Login";
import AdminUsuarios from "./AdminUsuarios";
import Inventory from "./Inventory";
import Proveedores from "./Proveedores";
import Semielaborados from "./Semielaborados";
import Reflectivas from "./Reflectivas";
import Metricas from "./Metricas";
import Ingenieria from "./Ingenieria";
import PlanificacionProduccion from "./PlanificacionProduccion";
import CargaProduccion from "./CargaProduccion";
import ComercialIA from "./ComercialIA";
import ProduccionPlanta from "./ProduccionPlanta";
import SolicitudesInternas from "./SolicitudesInternas";
import DespacharPedidos from "./DespacharPedidos";
import Pedidos from "./Pedidos"; // <-- AGREGADO: Importación del nuevo módulo

function App() {
  // PERSISTENCIA DE SESIÓN: Carga la sesión previa desde localStorage al refrescar
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

  const [activeModule, setActiveModule] = useState(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    if (
      params.get("status") === "conectado" ||
      params.get("module") === "comercial"
    ) {
      return "comercial";
    }
    if (path.startsWith("/plan/") || params.has("ot")) {
      return "planificacion";
    }
    if (path.startsWith("/carga-produccion")) {
      return "carga-produccion";
    }
    return "materias-primas";
  });

  useEffect(() => {
    const checkUrl = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      if (
        params.get("status") === "conectado" ||
        params.get("module") === "comercial"
      ) {
        setActiveModule("comercial");
      } else if (path.startsWith("/plan/") || params.has("ot")) {
        setActiveModule("planificacion");
      } else if (path.startsWith("/carga-produccion")) {
        setActiveModule("carga-produccion");
      }
    };

    checkUrl();
    window.addEventListener("popstate", checkUrl);
    return () => window.removeEventListener("popstate", checkUrl);
  }, []);

  // PROTECCIÓN DE MÓDULOS NO AUTORIZADOS
  useEffect(() => {
    if (usuarioActual && usuarioActual.rol?.toUpperCase() !== "ADMIN") {
      const tienePermiso =
        usuarioActual.permisos?.includes(activeModule) ||
        usuarioActual.permisos?.includes("*");
      if (!tienePermiso) {
        setActiveModule(usuarioActual.permisos?.[0] || "materias-primas");
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

  // GUARDAR SESIÓN EN LOCALSTORAGE
  const handleLoginSuccess = (user) => {
    setUsuarioActual(user);
    localStorage.setItem("usuario_conoflex", JSON.stringify(user));
  };

  // CERRAR SESIÓN Y LIMPIAR LOCALSTORAGE
  const handleLogout = () => {
    setUsuarioActual(null);
    localStorage.removeItem("usuario_conoflex");
    localStorage.removeItem("token");
    sessionStorage.clear();
    window.history.replaceState({}, document.title, "/");
  };

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
      setActiveModule={setActiveModule}
      onOpenUploadModal={() => setIsUploadModalOpen(true)}
      onReloadSheets={handleReloadSheets}
      isReloading={isReloading}
      usuarioActual={usuarioActual}
      onLogout={handleLogout}
    >
      {usuarioActual.rol?.toUpperCase() === "ADMIN" &&
        activeModule === "admin-usuarios" && <AdminUsuarios />}

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
        <Reflectivas key={reloadKey} />
      )}

      {hasAccess("metricas") && activeModule === "metricas" && (
        <Metricas key={reloadKey} />
      )}

      {hasAccess("ingenieria") && activeModule === "ingenieria" && (
        <Ingenieria />
      )}

      {hasAccess("planificacion") && activeModule === "planificacion" && (
        <PlanificacionProduccion />
      )}

      {/* <-- MÓDULO AGREGADO: PEDIDOS --> */}
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
