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
} from "lucide-react";

export default function Layout({
  children,
  activeModule,
  setActiveModule,
  onReloadSheets,
  isReloading,
}) {
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

  return (
    <div className="h-screen w-full bg-[#04060c] flex items-center justify-center p-2 sm:p-4 lg:p-5 overflow-hidden font-sans text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
      {/* MARCO DE LA APLICACIÓN CENTRADA */}
      <div className="w-full max-w-[1480px] h-full max-h-[96vh] flex rounded-2xl border border-slate-800/80 bg-[#070a12] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* SIDEBAR LATERAL */}
        <aside className="w-60 bg-[#090d16]/95 border-r border-[#1e293b] flex flex-col justify-between p-4 backdrop-blur-xl shrink-0 z-20 transition-all duration-300">
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
                      onClick={() => setActiveModule(item.id)}
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

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#070a12] overflow-hidden">
          {/* HEADER TOP-BAR LIMPIO */}
          <header className="bg-[#0f172a]/60 border-b border-[#1e293b] px-5 py-3 flex items-center justify-between backdrop-blur-md shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500">Módulo /</span>
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                {activeModule.replace("-", " ")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {activeModule === "semielaborados" && (
                <button
                  onClick={onReloadSheets}
                  disabled={isReloading}
                  className="bg-[#121824] hover:bg-[#1c253b] text-emerald-400 border border-emerald-500/30 px-3 py-1.5 text-xs font-mono rounded-lg transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <RefreshCw
                    size={13}
                    className={isReloading ? "animate-spin" : ""}
                  />
                  <span>Sincronizar Sheets</span>
                </button>
              )}
            </div>
          </header>

          {/* CONTENIDO INTERNO */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5 min-h-0 relative">
            <div className="h-full transition-all duration-300 ease-out">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
