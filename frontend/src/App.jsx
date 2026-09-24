import { useState, useEffect } from "react";
import Layout from "./Layout";
import Inventory from "./Inventory";
import Semielaborados from "./Semielaborados";
import Reflectivas from "./Reflectivas";
import Metricas from "./Metricas";
import Ingenieria from "./Ingenieria";
import PlanificacionProduccion from "./PlanificacionProduccion";
import CargaProduccion from "./CargaProduccion";

function App() {
  // DETECCIÓN AUTOMÁTICA DE URL DEL QR AL ARRANCAR LA APLICACIÓN
  const [activeModule, setActiveModule] = useState(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (path.startsWith("/plan/") || params.has("ot")) {
      return "planificacion";
    }
    if (path.startsWith("/carga-produccion")) {
      return "carga-produccion";
    }
    return "materias-primas";
  });

  // ESCUCHAR CAMBIOS DE NAVEGACIÓN EN TIEMPO REAL
  useEffect(() => {
    const checkUrl = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      if (path.startsWith("/plan/") || params.has("ot")) {
        setActiveModule("planificacion");
      }
      if (path.startsWith("/carga-produccion")) {
        setActiveModule("carga-produccion");
      }
    };
    window.addEventListener("popstate", checkUrl);
    return () => window.removeEventListener("popstate", checkUrl);
  }, []);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReloadSheets = async () => {
    if (activeModule !== "semielaborados") return;

    setIsReloading(true);
    try {
      // 👈 CAMBIO AQUÍ: Se cambió "http://localhost:3001/api/..." por "/api/..."
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

  return (
    <Layout
      activeModule={activeModule}
      setActiveModule={setActiveModule}
      onOpenUploadModal={() => setIsUploadModalOpen(true)}
      onReloadSheets={handleReloadSheets}
      isReloading={isReloading}
    >
      {/* MÓDULO 1: MATERIAS PRIMAS */}
      {activeModule === "materias-primas" && (
        <Inventory
          key={reloadKey}
          isUploadModalOpen={isUploadModalOpen}
          onCloseUploadModal={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* MÓDULO 2: SEMIELABORADOS */}
      {activeModule === "semielaborados" && (
        <Semielaborados
          key={reloadKey}
          isUploadModalOpen={isUploadModalOpen}
          onCloseUploadModal={() => setIsUploadModalOpen(false)}
        />
      )}

      {/* MÓDULO 3: REFLECTIVAS Y PEGADO */}
      {activeModule === "reflectivas" && <Reflectivas key={reloadKey} />}

      {/* MÓDULO 4: MÉTRICAS Y KPIS */}
      {activeModule === "metricas" && <Metricas key={reloadKey} />}

      {/* MÓDULO 5: INGENIERÍAS */}
      {activeModule === "ingenieria" && <Ingenieria />}

      {/* MÓDULO 6: PLANIFICACIÓN Y SEGUIMIENTO DE OT */}
      {activeModule === "planificacion" && <PlanificacionProduccion />}

      {/* MÓDULO 7: CARGA Y APROBACIÓN DE PRODUCCIÓN */}
      {activeModule === "carga-produccion" && <CargaProduccion />}

      {/* FALLBACK EN DESARROLLO */}
      {activeModule !== "materias-primas" &&
        activeModule !== "semielaborados" &&
        activeModule !== "reflectivas" &&
        activeModule !== "metricas" &&
        activeModule !== "ingenieria" &&
        activeModule !== "planificacion" &&
        activeModule !== "carga-produccion" && (
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
