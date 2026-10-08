import { useState } from "react";
import {
  Boxes,
  Layers,
  Sparkles,
  Cpu,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Activity,
  Bot,
  RefreshCw,
  Menu,
  X,
  ClipboardList,
  ShieldCheck,
  LogOut,
  UserCircle,
  Truck,
  Building2, // <-- AGREGADO
} from "lucide-react";

import logo from "./assets/logo.svg";

export default function Layout({
  children,
  activeModule,
  setActiveModule,
  onReloadSheets,
  isReloading,
  usuarioActual = { nombre: "Usuario", rol: "ADMIN", permisos: ["*"] },
  onLogout = () => {},
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const ALL_MENU_ITEMS = [
    { id: "materias-primas", label: "Materias Primas", icon: Boxes },
    { id: "proveedores", label: "Proveedores", icon: Building2 }, // <-- AGREGADO
    { id: "semielaborados", label: "Semielaborados", icon: Layers },
    { id: "reflectivas", label: "Reflectivas & Pegado", icon: Sparkles },
    { id: "ingenieria", label: "Ingeniería & BOM", icon: Cpu },
    {
      id: "metricas",
      label: "Métricas & KPI",
      icon: BarChart3,
      highlight: true,
    },
    { id: "planificacion", label: "Planificación OT", icon: CalendarDays },
    { id: "carga-produccion", label: "Carga Producción", icon: ClipboardCheck },
    { id: "comercial", label: "IA Comercial", icon: Bot },
    { id: "despachar-pedidos", label: "Despachar Pedidos", icon: Truck },
    {
      id: "solicitudes-internas",
      label: "Solicitudes Internas",
      icon: ClipboardList,
    },
    { id: "planta-online", label: "Planta On-Line", icon: Activity },
    {
      id: "admin-usuarios",
      label: "Panel Administrador",
      icon: ShieldCheck,
      adminOnly: true,
    },
  ];

  const rolUpper = (usuarioActual?.rol || "").toUpperCase();
  const permisos = usuarioActual?.permisos || [];

  const menuItems = ALL_MENU_ITEMS.filter((item) => {
    if (rolUpper === "ADMIN") return true;
    if (item.adminOnly) return false;
    return permisos.includes(item.id) || permisos.includes("*");
  });

  const handleSelectModule = (id) => {
    setActiveModule(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="h-screen w-full bg-[#020202] flex items-center justify-center p-0 md:p-3 lg:p-4 overflow-hidden font-sans text-zinc-100 antialiased selection:bg-[#FF5A00]/30 selection:text-white relative">
      {/* FONDO DE PUNTOS */}
      <style>{`
        .bg-dots-orange {
          background-image: radial-gradient(rgba(255, 90, 0, 0.2) 1px, transparent 1px);
          background-size: 24px 26px;
        }
        @keyframes dotsDrift {
          0% { background-position: 0 0; }
          50% { background-position: 12px 13px; }
          100% { background-position: 0 0; }
        }
        .animate-dots-drift {
          animation: dotsDrift 20s ease-in-out infinite;
        }
      `}</style>

      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-dots-orange animate-dots-drift opacity-60" />
      </div>

      {/* MARCO PRINCIPAL */}
      <div className="w-full max-w-[1600px] h-full md:max-h-[98vh] flex rounded-none md:rounded-2xl border-0 md:border md:border-zinc-800/90 bg-[#030303] shadow-[0_0_60px_rgba(0,0,0,0.95)] overflow-hidden relative z-10">
        {/* SIDEBAR DESKTOP */}
        <aside className="hidden md:flex w-64 bg-black border-r border-zinc-800/60 flex-col justify-between p-4 shrink-0 z-20 transition-all duration-300 relative">
          <div className="space-y-6 z-10">
            {/* BRANDING */}
            <div className="flex items-center gap-3 px-2 py-3 border-b border-zinc-800/60">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl shadow-[0_0_15px_rgba(255,90,0,0.2)] shrink-0">
                <img src={logo} alt="Logo" />
              </div>
              <div>
                <h1 className="font-extrabold italic text-base tracking-tighter text-white uppercase leading-none">
                  CONOFLEX
                </h1>
                <p className="text-[9px] text-[#FF5A00]   font-bold tracking-widest flex items-center gap-1.5 mt-1 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] shadow-[0_0_8px_#FF5A00]" />
                  GESTIÓN INDUSTRIAL
                </p>
              </div>
            </div>

            {/* NAVEGACIÓN */}
            <nav className="space-y-1">
              <span className="px-2 text-[10px]   font-bold uppercase text-zinc-600 tracking-widest block mb-2">
                Módulos del Sistema
              </span>
              <div className="space-y-1 overflow-y-auto max-h-[52vh] pr-1 scrollbar-none">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectModule(item.id)}
                      className={`w-full flex items-center gap-3 px-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer group relative border-b-2 ${
                        isActive
                          ? "text-[#FF5A00] border-[#FF5A00] bg-transparent"
                          : "text-zinc-500 hover:text-white border-transparent"
                      }`}
                    >
                      <Icon
                        size={16}
                        className={`transition-all duration-300 ${
                          isActive
                            ? "text-[#FF5A00] scale-110"
                            : "text-zinc-500 group-hover:text-white group-hover:scale-105"
                        }`}
                      />
                      <span className="truncate transition-colors duration-300">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* USER AREA */}
          <div className="pt-3 border-t border-zinc-800/60 space-y-2 z-10">
            <div className="bg-[#080808] p-3 rounded-xl border border-zinc-800/60 flex items-center gap-3">
              <UserCircle size={26} className="text-zinc-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {usuarioActual.nombre || usuarioActual.email || "Usuario"}
                </p>
                <p className="text-[9px]   font-bold text-[#FF5A00] uppercase tracking-widest truncate">
                  {usuarioActual.rol}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px]   font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 uppercase tracking-wider"
            >
              <LogOut size={13} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </aside>

        {/* DRAWER MOBILE CON ANIMACIÓN DESLIZABLE IZQUIERDA */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] md:hidden">
            <div className="w-72 max-w-[85vw] h-full bg-[#050505] p-5 flex flex-col justify-between border-r border-zinc-800 shadow-2xl relative animate-in slide-in-from-left-8 duration-300 ease-out">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white"
              >
                <X size={20} />
              </button>

              <div className="space-y-6 pt-2">
                <div className="flex items-center gap-3 px-2 py-3 border-b border-zinc-800/60 pr-8">
                  <div className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0">
                    <img src={logo} alt="Logo" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="font-extrabold italic text-sm tracking-tighter text-white uppercase truncate">
                      CONOFLEX
                    </h1>
                    <p className="text-[9px] text-[#FF5A00]   font-bold tracking-widest flex items-center gap-1 mt-0.5 uppercase truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] shrink-0" />
                      GESTIÓN INDUSTRIAL
                    </p>
                  </div>
                </div>

                <nav className="space-y-1">
                  <span className="px-2 text-[10px]   uppercase text-zinc-600 font-bold tracking-widest block mb-2">
                    Módulos del Sistema
                  </span>
                  <div className="space-y-1 max-h-[60vh] overflow-y-auto scrollbar-none pr-1">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeModule === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelectModule(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-300 border-b-2 ${
                            isActive
                              ? "text-[#FF5A00] border-[#FF5A00] bg-transparent"
                              : "text-zinc-500 hover:text-white border-transparent"
                          }`}
                        >
                          <Icon
                            size={16}
                            className={
                              isActive ? "text-[#FF5A00]" : "text-zinc-500"
                            }
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </div>

              <div className="pt-3 border-t border-zinc-800/60 space-y-2 shrink-0">
                <div className="bg-black p-3 rounded-xl border border-zinc-800/60 flex items-center gap-3">
                  <UserCircle size={24} className="text-zinc-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {usuarioActual.nombre || usuarioActual.email || "Usuario"}
                    </p>
                    <p className="text-[9px]   text-[#FF5A00] uppercase tracking-widest truncate">
                      {usuarioActual.rol}
                    </p>
                  </div>
                </div>

                <button
                  onClick={onLogout}
                  className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px]   font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition"
                >
                  <LogOut size={13} />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ÁREA PRINCIPAL CONTENEDORA */}
        <div className="flex-1 flex flex-col min-w-0 bg-black overflow-hidden relative">
          {/* HEADER MOBILE ULTRA FINO */}
          <div className="md:hidden flex items-center justify-between p-3 border-b border-zinc-800/50 bg-[#050505] shrink-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-1.5 text-zinc-300 hover:text-white bg-black border border-zinc-800 rounded-lg shrink-0"
              >
                <Menu size={18} />
              </button>
              <div className="flex flex-col min-w-0">
                <span className="text-white font-extrabold italic text-sm uppercase tracking-tighter truncate">
                  {activeModule.replace("-", " ")}
                </span>
                <span className="text-[9px] text-[#FF5A00]   tracking-widest font-bold uppercase truncate">
                  Conoflex App
                </span>
              </div>
            </div>

            {activeModule === "semielaborados" && (
              <button
                onClick={onReloadSheets}
                disabled={isReloading}
                className="bg-[#FFD700] text-black p-2 rounded-lg shrink-0"
              >
                <RefreshCw
                  size={14}
                  className={isReloading ? "animate-spin" : ""}
                />
              </button>
            )}
          </div>

          <main className="flex-1 overflow-y-auto overflow-x-hidden p-0 min-h-0 relative bg-black">
            <div className="h-full transition-all duration-300 ease-out">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
