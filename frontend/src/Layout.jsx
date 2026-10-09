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
  Building2,
  ListChecks,
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
  // ESTADO GLOBAL DEL MENÚ LATERAL (OCULTO POR DEFECTO SIEMPRE)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const ALL_MENU_ITEMS = [
    { id: "materias-primas", label: "Materias Primas", icon: Boxes },
    { id: "proveedores", label: "Proveedores", icon: Building2 },
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
    { id: "pedidos", label: "Pedidos", icon: ListChecks },
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
    setIsSidebarOpen(false); // Cierra automáticamente al seleccionar módulo
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

      {/* DRAWER DEL MENÚ (SIDEBAR DESLIZABLE) */}
      {/* Overlay Oscuro Atrás */}
      <div
        className={`fixed inset-0 z-[100] transition-all duration-300 ${
          isSidebarOpen
            ? "opacity-100 visible bg-black/80 backdrop-blur-sm"
            : "opacity-0 invisible bg-transparent"
        }`}
        onClick={() => setIsSidebarOpen(false)}
      >
        {/* Panel Deslizable */}
        <div
          className={`absolute top-0 left-0 h-full w-72 max-w-[85vw] bg-[#050505] p-5 flex flex-col justify-between border-r border-zinc-800 shadow-[20px_0_50px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-out ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()} // Evita que al clickear el panel se cierre
        >
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-[#FF5A00] transition-colors bg-black rounded-lg border border-zinc-800"
          >
            <X size={20} />
          </button>

          <div className="space-y-6 pt-2">
            <div className="flex items-center gap-3 px-2 py-3 border-b border-zinc-800/60 pr-8">
              <div className="w-10 h-10 sm:w-10 sm:h-10 rounded-full shrink-0 overflow-hidden">
                <img
                  src={logo}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-extrabold italic text-base tracking-tighter text-white uppercase truncate">
                  CONOFLEX APP
                </h1>
                <p className="text-[9px] text-[#FF5A00] font-bold tracking-widest flex items-center gap-1.5 mt-0.5 uppercase truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] shadow-[0_0_8px_#FF5A00] shrink-0" />
                  GESTIÓN INDUSTRIAL
                </p>
              </div>
            </div>

            <nav className="space-y-1">
              <span className="px-2 text-[10px] uppercase text-zinc-600 font-bold tracking-widest block mb-2">
                Módulos del Sistema
              </span>
              <div className="space-y-1 max-h-[65vh] overflow-y-auto custom-scrollbar pr-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectModule(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 text-xs font-bold uppercase tracking-wider transition-all duration-300 border-b-2 rounded-t-sm ${
                        isActive
                          ? "text-[#FF5A00] border-[#FF5A00] bg-[#FF5A00]/10"
                          : "text-zinc-500 hover:text-white border-transparent hover:bg-zinc-900/50"
                      }`}
                    >
                      <Icon
                        size={18}
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

          <div className="pt-4 border-t border-zinc-800/60 space-y-3 shrink-0">
            <div className="bg-black p-3.5 rounded-xl border border-zinc-800/60 flex items-center gap-3 shadow-inner">
              <UserCircle size={28} className="text-zinc-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {usuarioActual.nombre || usuarioActual.email || "Usuario"}
                </p>
                <p className="text-[10px] font-black text-[#FF5A00] uppercase tracking-widest truncate">
                  {usuarioActual.rol}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 uppercase tracking-wider"
            >
              <LogOut size={14} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </div>

      {/* MARCO PRINCIPAL DE LA APLICACIÓN */}
      <div className="w-full max-w-[1600px] h-full md:max-h-[98vh] flex flex-col rounded-none md:rounded-2xl border-0 md:border md:border-zinc-800/90 bg-[#030303] shadow-[0_0_60px_rgba(0,0,0,0.95)] overflow-hidden relative z-10">
        {/* HEADER SUPERIOR GLOBAL */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-zinc-800/50 bg-[#050505] shrink-0 z-30">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 sm:p-2.5 text-zinc-400 hover:text-[#FFD700] hover:border-[#FFD700] bg-black border border-zinc-800 rounded-lg shrink-0 transition-colors cursor-pointer"
            >
              <Menu size={22} />
            </button>

            <div className="w-10 h-10 sm:w-10 sm:h-10 rounded-full shrink-0 overflow-hidden">
              <img
                src={logo}
                alt="Logo"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex flex-col min-w-0 justify-center">
              <span className="text-white font-extrabold italic text-base sm:text-xl uppercase tracking-tighter truncate leading-none">
                CONOFLEX APP
              </span>
              <span className="text-[9px] sm:text-[10px] text-[#FF5A00] tracking-widest font-bold uppercase truncate mt-0.5 sm:mt-1">
                GESTIÓN DE PRODUCCIÓN
              </span>
            </div>
          </div>

          {/* BOTÓN RECARGAR (EJ: PARA SEMIELABORADOS) */}
          {activeModule === "semielaborados" && (
            <button
              onClick={onReloadSheets}
              disabled={isReloading}
              className="bg-[#FFD700] hover:bg-white text-black px-4 py-2 rounded-lg shrink-0 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-bold text-[10px] sm:text-xs uppercase tracking-wider"
            >
              <RefreshCw
                size={14}
                className={isReloading ? "animate-spin" : ""}
              />
              <span className="hidden sm:inline">
                {isReloading ? "Sincronizando..." : "Sincronizar Sheets"}
              </span>
            </button>
          )}
        </div>

        {/* ÁREA DE CONTENIDO DINÁMICA */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-0 min-h-0 relative bg-black">
          <div className="h-full transition-all duration-300 ease-out">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
