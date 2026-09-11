import { useState } from "react";
import {
  Package,
  Layers,
  Sparkles,
  FlaskConical,
  ArrowLeftRight,
  TrendingUp,
  Settings,
  Menu,
  X,
  Zap,
  Flame, // 👈 Ícono para Carga Producción
} from "lucide-react";

export default function Layout({ children, activeModule, setActiveModule }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { id: "materias-primas", label: "Materias Primas", icon: Package },
    { id: "semielaborados", label: "Semielaborados", icon: Layers },
    { id: "reflectivas", label: "Reflectivas", icon: Sparkles },
    { id: "ingenieria", label: "Ingeniería", icon: FlaskConical },
    { id: "metricas", label: "Métricas & KPI", icon: TrendingUp },
    { id: "planificacion", label: "Planificación OT", icon: Zap },
    { id: "carga-produccion", label: "Carga Producción", icon: Flame }, // 👈 NUEVO MÓDULO
    { id: "movimientos", label: "Movimientos Stock", icon: ArrowLeftRight },
    { id: "configuraciones", label: "Configuración", icon: Settings },
  ];

  return (
    <div className="h-[100dvh] p-2 md:p-4 flex items-center justify-center font-mono bg-[#140a24] overflow-hidden select-none">
      <div className="w-full max-w-7xl h-full bg-[#24173e] border-2 border-[#432874] shadow-[6px_6px_0px_#000] flex flex-col relative overflow-hidden rounded-xs">
        {/* ENCABEZADO SUPERIOR */}
        <header className="bg-[#160c2b] border-b-2 border-[#432874] p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* LOGO CONO VIAL ESTILO RPG */}
            <div className="w-10 h-10 bg-[#2c1a4d] border-2 border-[#ffbe00] flex items-center justify-center p-1.5 shrink-0 shadow-[2px_2px_0px_#000] rounded-xs">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
              >
                <polygon points="12,3 9.5,9.5 14.5,9.5" fill="#ffbe00" />
                <polygon
                  points="9.5,9.5 14.5,9.5 16.5,14.5 7.5,14.5"
                  fill="#FFFFFF"
                />
                <polygon
                  points="7.5,14.5 16.5,14.5 18.5,19.5 5.5,19.5"
                  fill="#ffbe00"
                />
                <rect
                  x="3"
                  y="19.5"
                  width="18"
                  height="2.5"
                  rx="0.5"
                  fill="#ffbe00"
                />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-xl text-[#ffbe00] font-bold tracking-wider drop-shadow-[1px_1px_0px_#000]">
                  CONOFLEX
                </span>
              </div>
              <p className="text-[11px] text-[#a594c9] truncate font-mono">
                Gestión Industrial •{" "}
                <span className="text-white capitalize">
                  {activeModule.replace("-", " ")}
                </span>
              </p>
            </div>
          </div>

          {/* BOTÓN MENÚ MOBILE */}
          <button
            className="md:hidden text-[#ffbe00] p-1.5 border-2 border-[#432874] bg-[#2c1a4d] shadow-[2px_2px_0px_#000]"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* CUERPO PRINCIPAL Y SIDEBAR */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
          <aside
            className={`
              w-full md:w-64 bg-[#160c2b] border-r-2 border-[#432874] p-3 flex flex-col justify-between shrink-0
              ${mobileOpen ? "absolute inset-0 z-50 bg-[#160c2b]" : "hidden md:flex"}
            `}
          >
            <div className="space-y-1">
              <div className="text-[10px] font-pixel text-[#24cc8f] tracking-widest px-3 py-2 uppercase border-b border-[#432874] mb-2 flex items-center justify-between">
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
                      w-full flex items-center gap-3 px-3 py-2.5 text-xs font-semibold transition-all duration-150 border-l-4 text-left rounded-xs group
                      ${
                        isSelected
                          ? "bg-[#2c1a4d] border-[#ffbe00] text-white shadow-sm"
                          : "border-transparent text-[#a594c9] hover:text-white hover:bg-[#2c1a4d]/50 hover:border-[#432874]"
                      }
                    `}
                  >
                    <Icon
                      size={16}
                      className={
                        isSelected
                          ? "text-[#ffbe00]"
                          : "text-[#a594c9] group-hover:text-white"
                      }
                    />
                    <span className="flex-1 font-pixel text-[11px]">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#432874] text-[11px] text-[#6e588a] flex items-center justify-between px-2 shrink-0">
              <span className="font-pixel">Conoflex Argentina</span>
            </div>
          </aside>

          {/* CONTENIDO DE MÓDULO */}
          <main className="flex-1 p-2 md:p-4 bg-[#1a0f2e] overflow-hidden flex flex-col min-h-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
