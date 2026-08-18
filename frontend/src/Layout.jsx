import { useState } from "react";
import {
  Package,
  Layers,
  Sparkles,
  FlaskConical,
  ArrowLeftRight,
  Settings,
  RotateCw,
  ArrowUp,
  Menu,
  X,
  Circle,
} from "lucide-react";

export default function Layout({
  children,
  activeModule,
  setActiveModule,
  onOpenUploadModal,
  onReloadSheets,
  isReloading,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { id: "materias-primas", label: "Materias Primas", icon: Package },
    { id: "semielaborados", label: "Semielaborados", icon: Layers },
    { id: "reflectivas", label: "Reflectivas", icon: Sparkles },
    { id: "ingenieria", label: "Ingeniería", icon: FlaskConical },
    { id: "movimientos", label: "Movimientos Stock", icon: ArrowLeftRight },
    { id: "configuraciones", label: "Configuración", icon: Settings },
  ];

  const showHeaderActions =
    activeModule === "materias-primas" || activeModule === "semielaborados";

  return (
    <div className="h-[100dvh] p-2 md:p-5 flex items-center justify-center font-mono bg-[#070A12] overflow-hidden select-none">
      <div className="w-full max-w-7xl h-full bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl flex flex-col relative overflow-hidden">
        {/* ENCABEZADO SUPERIOR */}
        <header className="bg-[#0B0F19] border-b-2 border-[#1E2842] p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FF5500] border-2 border-white flex items-center justify-center text-black font-pixel font-bold text-xl shadow-[2px_2px_0px_#000] animate-pulse shrink-0">
              ▲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-2xl text-[#FF5500] font-bold tracking-wider drop-shadow-sm">
                  CONOFLEX
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Gestión Industrial •{" "}
                <span className="text-white capitalize">
                  {activeModule.replace("-", " ")}
                </span>
              </p>
            </div>
          </div>

          {/* BOTONES HEADER */}
          <div className="hidden md:flex items-center gap-3">
            {showHeaderActions && (
              <>
                <button
                  onClick={onReloadSheets}
                  disabled={isReloading}
                  className="p-2 bg-[#161C2E] border border-[#1E2842] text-[#00E5FF] hover:text-white hover:border-[#00E5FF] transition-colors disabled:opacity-50 active:translate-y-0.5"
                  title="Recargar desde Google Sheets"
                >
                  <RotateCw
                    size={16}
                    className={isReloading ? "animate-spin" : ""}
                  />
                </button>

                <button
                  onClick={onOpenUploadModal}
                  className="flex items-center gap-2 bg-[#00C853] text-black font-pixel font-bold px-4 py-1.5 border border-white shadow-[2px_2px_0px_#000] hover:bg-[#00E676] active:translate-y-0.5 transition-all text-xs"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                  <span>Cargar Excel</span>
                </button>
              </>
            )}
          </div>

          <button
            className="md:hidden text-[#FF5500] p-1.5 border border-[#1E2842] bg-[#161C2E]"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* CUERPO PRINCIPAL */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
          <aside
            className={`
            w-full md:w-64 bg-[#0B0F19] border-r-2 border-[#1E2842] p-3 flex flex-col justify-between shrink-0
            ${mobileOpen ? "absolute inset-0 z-50 bg-[#0E1322]" : "hidden md:flex"}
          `}
          >
            <div className="space-y-1">
              <div className="text-[10px] font-pixel text-[#00E5FF] tracking-widest px-3 py-2 uppercase border-b border-[#1E2842] mb-2 flex items-center justify-between">
                <span>Módulos del Sistema</span>
                {mobileOpen && (
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="md:hidden text-white"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {menuItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold transition-all duration-150 border-l-4 text-left group
                      ${
                        isSelected
                          ? "bg-[#161C2E] border-[#FF5500] text-white shadow-sm"
                          : "border-transparent text-slate-400 hover:text-white hover:bg-[#161C2E]/50 hover:border-[#1E2842]"
                      }
                    `}
                  >
                    <Icon
                      size={16}
                      className={
                        isSelected
                          ? "text-[#FF5500]"
                          : "text-slate-400 group-hover:text-white"
                      }
                    />
                    <span className="flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#1E2842] text-[11px] text-slate-400 flex items-center justify-between px-2 shrink-0">
              <span className="font-pixel">Conoflex Argentina</span>
            </div>
          </aside>

          <main className="flex-1 p-3 md:p-5 bg-[#070A12] overflow-hidden flex flex-col min-h-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
