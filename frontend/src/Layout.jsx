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
} from "lucide-react";

export default function Layout({
  children,
  activeModule,
  setActiveModule,
  onReloadSheets,
  isReloading,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: "materias-primas", label: "Materias Primas", icon: Boxes },
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
  ];

  const handleSelectModule = (id) => {
    setActiveModule(id);
    setMobileMenuOpen(false); // Cierra automáticamente el menú en celulares al seleccionar
  };

  return (
    <div className="h-screen w-full bg-[#04060c] flex items-center justify-center p-0 md:p-3 lg:p-5 overflow-hidden font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* MARCO DE LA APLICACIÓN */}
      <div className="w-full max-w-[1480px] h-full md:max-h-[96vh] flex rounded-none md:rounded-2xl border-0 md:border md:border-slate-800/80 bg-[#070a12] shadow-none md:shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden relative">
        {/* SIDEBAR ESCRITORIO (Oculta en mobile, visible en pantallas md en adelante) */}
        <aside className="hidden md:flex w-60 bg-[#090d16]/95 border-r border-[#1e293b] flex-col justify-between p-4 backdrop-blur-xl shrink-0 z-20 transition-all duration-300">
          <div className="space-y-5">
            {/* BRANDING */}
            <div className="flex items-center gap-3 px-2 py-2.5 border-b border-[#1e293b]">
              <div className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/40 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                <span className="font-mono font-black text-amber-400 text-sm tracking-tighter">
                  CX
                </span>
              </div>
              <div>
                <h1 className="font-mono font-bold text-xs tracking-widest text-white uppercase">
                  CONOFLEX
                </h1>
                <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                  GESTIÓN INDUSTRIAL
                </p>
              </div>
            </div>

            {/* MENÚ DE MÓDULOS */}
            <nav className="space-y-1">
              <span className="px-2 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                Módulos del Sistema
              </span>
              <div className="pt-2 space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectModule(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer group ${
                        isActive
                          ? item.highlight
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.12)] font-semibold"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.12)] font-semibold"
                          : "text-slate-400 hover:text-slate-200 hover:bg-[#121824] border border-transparent"
                      }`}
                    >
                      <Icon
                        size={15}
                        className={`transition-transform duration-200 group-hover:scale-110 ${
                          isActive
                            ? item.highlight
                              ? "text-emerald-400"
                              : "text-amber-400"
                            : "text-slate-500 group-hover:text-slate-300"
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* ESTADO CONEXIÓN */}
          <div className="pt-3 border-t border-[#1e293b]">
            <div className="bg-[#0e1422] p-2.5 rounded-xl border border-[#1e293b] flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <Activity
                  size={13}
                  className="text-emerald-400 animate-pulse"
                />
                <span>Planta On-Line</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">v3.8</span>
            </div>
          </div>
        </aside>

        {/* MENÚ DESLIZANTE PARA CELULARES (DRAWER MOBILE) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 md:hidden animate-in fade-in duration-200">
            <div className="w-72 max-w-[85vw] h-full bg-[#090d16] p-4 flex flex-col justify-between border-r border-[#1e293b] shadow-2xl relative">
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>

              <div className="space-y-5 pt-2">
                <div className="flex items-center gap-3 px-2 py-2.5 border-b border-[#1e293b]">
                  <div className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/40 rounded-xl">
                    <span className="font-mono font-black text-amber-400 text-sm">
                      CX
                    </span>
                  </div>
                  <div>
                    <h1 className="font-mono font-bold text-xs tracking-widest text-white uppercase">
                      CONOFLEX
                    </h1>
                    <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      GESTIÓN INDUSTRIAL
                    </p>
                  </div>
                </div>

                <nav className="space-y-1">
                  <span className="px-2 text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                    Módulos del Sistema
                  </span>
                  <div className="pt-2 space-y-1">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeModule === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelectModule(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                            isActive
                              ? item.highlight
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold"
                              : "text-slate-400 hover:text-slate-200 hover:bg-[#121824]"
                          }`}
                        >
                          <Icon size={16} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </div>

              <div className="pt-3 border-t border-[#1e293b]">
                <div className="bg-[#0e1422] p-2.5 rounded-xl border border-[#1e293b] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                    <Activity
                      size={13}
                      className="text-emerald-400 animate-pulse"
                    />
                    <span>Planta On-Line</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    v3.8
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#070a12] overflow-hidden">
          {/* HEADER TOP-BAR RESPONSIVE */}
          <header className="bg-[#0f172a]/60 border-b border-[#1e293b] px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between backdrop-blur-md shrink-0 z-10">
            <div className="flex items-center gap-2.5">
              {/* BOTÓN HAMBURGUESA SOLO VISIBLE EN CELULARES */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-1.5 md:hidden text-slate-300 hover:text-white bg-[#121824] border border-slate-800 rounded-lg"
                title="Abrir menú"
              >
                <Menu size={18} />
              </button>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-slate-500 hidden xs:inline">
                  Módulo /
                </span>
                <span className="font-bold text-amber-400 uppercase tracking-wider truncate max-w-[160px] sm:max-w-none">
                  {activeModule.replace("-", " ")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeModule === "semielaborados" && (
                <button
                  onClick={onReloadSheets}
                  disabled={isReloading}
                  className="bg-[#121824] hover:bg-[#1c253b] text-emerald-400 border border-emerald-500/30 px-2.5 sm:px-3 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw
                    size={13}
                    className={isReloading ? "animate-spin" : ""}
                  />
                  <span className="hidden sm:inline">Sincronizar Sheets</span>
                </button>
              )}
            </div>
          </header>

          {/* CONTENIDO INTERNO */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-5 min-h-0 relative">
            <div className="h-full transition-all duration-300 ease-out">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
