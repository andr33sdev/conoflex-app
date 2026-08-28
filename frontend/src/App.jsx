import { useState } from "react";
import Layout from "./Layout";
import Inventory from "./Inventory";
import Semielaborados from "./Semielaborados";
import Reflectivas from "./Reflectivas";
import Metricas from "./Metricas";
import Ingenieria from "./Ingenieria";

function App() {
  const [activeModule, setActiveModule] = useState("materias-primas");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleReloadSheets = async () => {
    if (activeModule !== "semielaborados") return;

    setIsReloading(true);
    try {
      const res = await fetch(
        "http://localhost:3001/api/semielaborados/recargar-sheets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

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

      {/* FALLBACK EN DESARROLLO (SÓLO SE MUESTRA EN MÓDULOS NO IMPLEMENTADOS) */}
      {activeModule !== "materias-primas" &&
        activeModule !== "semielaborados" &&
        activeModule !== "reflectivas" &&
        activeModule !== "metricas" &&
        activeModule !== "ingenieria" && (
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
