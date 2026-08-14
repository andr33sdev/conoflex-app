import { useState } from 'react';
import { Package, Layers, ArrowLeftRight, Settings, RotateCw, ArrowUp, Menu, X, Circle } from 'lucide-react';

export default function Layout({ children, activeModule, setActiveModule, onOpenUploadModal }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = [
    { id: 'materias-primas', label: 'Materias Primas', icon: Package },
    { id: 'produccion', label: 'Producción Diaria', icon: Layers },
    { id: 'movimientos', label: 'Movimientos Stock', icon: ArrowLeftRight },
    { id: 'configuraciones', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="min-h-screen p-2 md:p-6 flex items-center justify-center font-mono">
      <div className="w-full max-w-7xl bg-conoflex-bg border-2 border-conoflex-border shadow-2xl flex flex-col min-h-[85vh] relative overflow-hidden">
        
        {/* ENCABEZADO SUPERIOR */}
        <header className="bg-conoflex-panel border-b-2 border-conoflex-border p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-conoflex-orange border-2 border-white flex items-center justify-center text-black font-pixel font-bold text-xl shadow-pixel-dark animate-pixel-bounce">
              ▲
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-pixel text-2xl text-conoflex-orange font-bold tracking-wider">CONOFLEX</span>
                <span className="text-[10px] bg-conoflex-orange/20 text-conoflex-orange border border-conoflex-orange/40 px-1.5 py-0.5 font-pixel">
                  INDIE v1.0
                </span>
              </div>
              <p className="text-xs text-conoflex-muted">
                Gestión Industrial • <span className="text-white capitalize">{activeModule.replace('-', ' ')}</span>
              </p>
            </div>
          </div>

          {/* Botones Header */}
          <div className="hidden md:flex items-center gap-3">
            <button 
              onClick={() => window.location.reload()} 
              className="p-2 bg-conoflex-card border border-conoflex-border text-conoflex-muted hover:text-white hover:border-conoflex-orange transition-colors"
              title="Recargar Módulo"
            >
              <RotateCw size={16} />
            </button>

            {/* BOTÓN REQUERIDO: SUBIR PLANILLA CON ÍCONO DE FLECHA HACIA ARRIBA */}
            <button 
              onClick={onOpenUploadModal}
              className="flex items-center gap-2 bg-conoflex-orange text-black font-pixel font-bold px-4 py-1.5 border border-white shadow-pixel-dark hover:bg-conoflex-orange-hover active:translate-y-0.5 transition-all text-sm"
            >
              <ArrowUp size={18} strokeWidth={2.5} />
              <span>SUBIR PLANILLA</span>
            </button>
          </div>

          <button 
            className="md:hidden text-conoflex-orange p-1.5 border border-conoflex-border bg-conoflex-card"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* CUERPO PRINCIPAL */}
        <div className="flex-1 flex flex-col md:flex-row relative">
          <aside className={`
            w-full md:w-64 bg-conoflex-panel border-r-2 border-conoflex-border p-3 flex flex-col justify-between
            ${mobileOpen ? 'block' : 'hidden md:flex'}
          `}>
            <div className="space-y-1">
              <div className="text-[11px] font-pixel text-conoflex-muted tracking-widest px-3 py-2 uppercase border-b border-conoflex-border mb-2">
                Módulos del Sistema
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
                      ${isSelected 
                        ? 'bg-conoflex-card border-conoflex-orange text-white shadow-sm' 
                        : 'border-transparent text-conoflex-muted hover:text-white hover:bg-conoflex-card/50 hover:border-conoflex-border'}
                    `}
                  >
                    <Icon size={16} className={isSelected ? 'text-conoflex-orange' : 'text-conoflex-muted group-hover:text-white'} />
                    <span className="flex-1">{item.label}</span>
                    {isSelected && <Circle size={6} className="fill-conoflex-orange text-conoflex-orange animate-pulse" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-conoflex-border text-[11px] text-conoflex-muted flex items-center justify-between px-2">
              <span className="font-pixel">FEROZO DB</span>
              <span className="text-conoflex-green flex items-center gap-1 font-pixel">
                <span className="w-2 h-2 rounded-full bg-conoflex-green animate-ping inline-block" />
                ONLINE
              </span>
            </div>
          </aside>

          <main className="flex-1 p-4 md:p-6 bg-conoflex-bg overflow-y-auto">
            {children}
          </main>
        </div>

      </div>
    </div>
  );
}