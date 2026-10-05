import { useState, useEffect } from "react";
import Layout from "./Layout";
import Login from "./Login"; // NUEVO COMPONENTE
import AdminUsuarios from "./AdminUsuarios"; // NUEVO COMPONENTE
import Inventory from "./Inventory";
import Semielaborados from "./Semielaborados";
import Reflectivas from "./Reflectivas";
import Metricas from "./Metricas";
import Ingenieria from "./Ingenieria";
import PlanificacionProduccion from "./PlanificacionProduccion";
import CargaProduccion from "./CargaProduccion";
import ComercialIA from "./ComercialIA";
import ProduccionPlanta from "./ProduccionPlanta";
import SolicitudesInternas from "./SolicitudesInternas";

function App() {
  // ESTADO GLOBAL DE AUTENTICACIÓN
  const [usuarioActual, setUsuarioActual] = useState(null);

  // DETECCIÓN AUTOMÁTICA DE URL O REDIRECCIÓN DE GOOGLE AL ARRANCAR
  const [activeModule, setActiveModule] = useState(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // Si viene redirigido del login de Google para la IA Comercial
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

  // ESCUCHAR CAMBIOS DE NAVEGACIÓN Y PARÁMETROS EN TIEMPO REAL
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

  // SEGURIDAD: REDIRIGIR SI NO TIENE PERMISO AL MÓDULO ACTUAL
  useEffect(() => {
    if (usuarioActual && usuarioActual.rol?.toUpperCase() !== "ADMIN") {
      const tienePermiso =
        usuarioActual.permisos.includes(activeModule) ||
        usuarioActual.permisos.includes("*");
      if (!tienePermiso) {
        setActiveModule(usuarioActual.permisos[0] || "materias-primas");
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

  // FUNCIÓN CERRAR SESIÓN BLINDADA
  const handleLogout = () => {
    setUsuarioActual(null);
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, document.title, "/");
    window.location.reload();
  };

  // PANTALLA DE LOGIN
  if (!usuarioActual) {
    return <Login onLogin={(user) => setUsuarioActual(user)} />;
  }

  // FUNCIÓN DE VERIFICACIÓN DE PERMISOS PARA RENDER CONDICIONAL
  const hasAccess = (moduleId) => {
    if (usuarioActual.rol?.toUpperCase() === "ADMIN") return true;
    return (
      usuarioActual.permisos.includes(moduleId) ||
      usuarioActual.permisos.includes("*")
    );
  };

  return (
    <Layout
      activeModule={activeModule}
      setActiveModule={setActiveModule}
      onOpenUploadModal={() => setIsUploadModalOpen(true)}
      onReloadSheets={handleReloadSheets}
      isReloading={isReloading}
      usuarioActual={usuarioActual} // PASAMOS EL USUARIO AL LAYOUT
      onLogout={handleLogout} // PASAMOS LA FUNCIÓN DE CERRAR SESIÓN
    >
      {/* MÓDULO DE ADMIN: SOLO VISIBLE SI ES ADMIN */}
      {usuarioActual.rol?.toUpperCase() === "ADMIN" &&
        activeModule === "admin-usuarios" && <AdminUsuarios />}

      {/* MÓDULO 1: MATERIAS PRIMAS */}
      {hasAccess("materias-primas") && activeModule === "materias-primas" && (
        <Inventory
          key={reloadKey}
          isUploadModalOpen={isUploadModalOpen}
          onCloseUploadModal={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* MÓDULO 2: SEMIELABORADOS */}
      {hasAccess("semielaborados") && activeModule === "semielaborados" && (
        <Semielaborados
          key={reloadKey}
          isUploadModalOpen={isUploadModalOpen}
          onCloseUploadModal={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* MÓDULO 3: SOLICITUDES INTERNAS DE DEPÓSITO */}
      {hasAccess("solicitudes-internas") &&
        activeModule === "solicitudes-internas" && <SolicitudesInternas />}

      {/* MÓDULO 4: REFLECTIVAS Y PEGADO */}
      {hasAccess("reflectivas") && activeModule === "reflectivas" && (
        <Reflectivas key={reloadKey} />
      )}

      {/* MÓDULO 5: MÉTRICAS Y KPIS */}
      {hasAccess("metricas") && activeModule === "metricas" && (
        <Metricas key={reloadKey} />
      )}

      {/* MÓDULO 6: INGENIERÍAS */}
      {hasAccess("ingenieria") && activeModule === "ingenieria" && (
        <Ingenieria />
      )}

      {/* MÓDULO 7: PLANIFICACIÓN Y SEGUIMIENTO DE OT */}
      {hasAccess("planificacion") && activeModule === "planificacion" && (
        <PlanificacionProduccion />
      )}

      {/* MÓDULO 8: CARGA Y APROBACIÓN DE PRODUCCIÓN */}
      {hasAccess("carga-produccion") && activeModule === "carga-produccion" && (
        <CargaProduccion />
      )}

      {/* MÓDULO 9: IA COMERCIAL */}
      {hasAccess("comercial") && activeModule === "comercial" && (
        <ComercialIA />
      )}

      {/* MÓDULO 10: PLANTA ON-LINE (3D) */}
      {hasAccess("planta-online") && activeModule === "planta-online" && (
        <ProduccionPlanta />
      )}

      {/* FALLBACK EN DESARROLLO */}
      {activeModule !== "materias-primas" &&
        activeModule !== "semielaborados" &&
        activeModule !== "solicitudes-internas" &&
        activeModule !== "reflectivas" &&
        activeModule !== "metricas" &&
        activeModule !== "ingenieria" &&
        activeModule !== "planificacion" &&
        activeModule !== "carga-produccion" &&
        activeModule !== "comercial" &&
        activeModule !== "planta-online" &&
        activeModule !== "admin-usuarios" && (
          <div className="text-center py-20 text-conoflex-muted space-y-3 font-pixel">
            <p className="text-2xl text-white">
              Módulo [{activeModule.toUpperCase()}] en desarrollo
            </p>
            <p className="text-sm">Próximamente disponible.</p>
          </div>
        )}
    </Layout>
  );
}

export default App;
