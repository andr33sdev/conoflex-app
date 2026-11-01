import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Menu,
  X,
  LogOut,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Ellipsis,
  Moon,
  Sun,
} from "lucide-react";

import logo from "./assets/logo.svg";
import CommandPalette from "./CommandPalette";
import Campanita from "./Campanita";
import { cambiarTema, useTema } from "./tema";
import {
  GRUPOS,
  INICIO,
  itemsPermitidos,
  itemPorId,
  anotarReciente,
  leerRecientes,
} from "./menu";

const iniciales = (n = "") =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "U";

/* Marca de carril: el detalle propio de Conoflex. Una línea de calzada discontinua amarilla. */
const Carril = ({ className = "" }) => (
  <span
    aria-hidden
    className={`block w-[3px] rounded-full ${className}`}
    style={{
      backgroundImage:
        "repeating-linear-gradient(to bottom,#FFD60A 0 6px,transparent 6px 10px)",
    }}
  />
);

function NavItem({ item, activo, colapsado, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={colapsado ? item.label : undefined}
      aria-current={activo ? "page" : undefined}
      className={`relative w-full flex items-center gap-3 rounded-xl text-[13.5px] font-medium transition-colors ${
        colapsado ? "justify-center h-11" : "px-3 h-10"
      } ${activo ? "text-white" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"}`}
    >
      {activo && (
        <motion.span
          layoutId="nav-activo"
          className="absolute inset-0 rounded-xl bg-[#FF5A00]/[0.13] ring-1 ring-inset ring-[#FF5A00]/25"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      {activo && (
        <Carril className="absolute left-[-9px] top-2 bottom-2 hidden lg:block" />
      )}
      <Icon
        size={18}
        className={`relative shrink-0 ${activo ? "text-[#FF5A00]" : ""}`}
      />
      {!colapsado && <span className="relative truncate">{item.label}</span>}
      {!colapsado && item.highlight && !activo && (
        <span
          className="relative ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD60A]"
          aria-hidden
        />
      )}
    </button>
  );
}

function MenuCompleto({ items, activeModule, colapsado, onElegir }) {
  return (
    <nav
      className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-5"
      aria-label="Módulos"
    >
      <NavItem
        item={INICIO}
        activo={activeModule === "inicio"}
        colapsado={colapsado}
        onClick={() => onElegir("inicio")}
      />
      {GRUPOS.map((g) => {
        const lista = items.filter((i) => i.grupo === g.id);
        if (!lista.length) return null;
        return (
          <div key={g.id} className="space-y-0.5">
            {!colapsado ? (
              <p className="px-3 pb-1.5 text-xs font-semibold text-zinc-500">
                {g.label}
              </p>
            ) : (
              <div className="mx-3 mb-2 border-t border-white/[0.06]" />
            )}
            {lista.map((it) => (
              <NavItem
                key={it.id}
                item={it}
                activo={activeModule === it.id}
                colapsado={colapsado}
                onClick={() => onElegir(it.id)}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function BotonTema() {
  const tema = useTema();
  const [error, setError] = useState(false);
  const claro = tema === "claro";
  return (
    <button
      onClick={async () => setError(!(await cambiarTema(claro ? "oscuro" : "claro")))}
      title={error ? "No pude guardar tu preferencia en el servidor; queda solo en este dispositivo" : claro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      aria-label={claro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className={`p-2 rounded-lg transition-colors hover:bg-white/[0.06] ${error ? "text-amber-400" : "text-zinc-500 hover:text-[#FF5A00]"}`}
    >
      {claro ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}

function Usuario({ usuario, onLogout, colapsado }) {
  return (
    <div
      className={`p-3 border-t border-white/[0.06] ${colapsado ? "flex flex-col items-center gap-2" : "flex items-center gap-3"}`}
    >
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF5A00] to-[#c23f00] grid place-items-center text-[13px] font-bold text-black shrink-0">
        {iniciales(usuario.nombre || usuario.email)}
      </div>
      {!colapsado && (
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate">
            {usuario.nombre || usuario.email || "Usuario"}
          </p>
          <p className="text-xs text-zinc-500 truncate capitalize">
            {(usuario.rol || "").toLowerCase()}
          </p>
        </div>
      )}
      <BotonTema />
      <button
        onClick={onLogout}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
      >
        <LogOut size={17} />
      </button>
    </div>
  );
}

export default function Layout({
  children,
  activeModule,
  setActiveModule,
  usuarioActual = { nombre: "Usuario", rol: "ADMIN", permisos: ["*"] },
  onLogout = () => {},
}) {
  const [drawer, setDrawer] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [colapsado, setColapsado] = useState(() => {
    try {
      const g = localStorage.getItem("cf_sidebar_colapsado");
      if (g === "1" || g === "0") return g === "1";
    } catch {
      /* sin almacenamiento */
    }
    // Sin preferencia guardada: en pantallas medianas (notebook chica, tablet) arranca achicado
    return window.innerWidth < 1440;
  });
  const alternarMenu = () =>
    setColapsado((c) => {
      try {
        localStorage.setItem("cf_sidebar_colapsado", c ? "0" : "1");
      } catch {
        /* ok */
      }
      return !c;
    });

  const items = useMemo(() => itemsPermitidos(usuarioActual), [usuarioActual]);
  const actual = itemPorId(activeModule);
  const grupoActual = GRUPOS.find((g) => g.id === actual?.grupo);

  // Anota el módulo actual (idempotente) y lee la lista para la barra inferior del celular
  const recientes = useMemo(() => {
    anotarReciente(activeModule);
    return leerRecientes();
  }, [activeModule]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
      }
    };
    const abrir = () => setPaleta(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cf:buscar", abrir);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cf:buscar", abrir);
    };
  }, []);

  const ir = (id) => {
    setActiveModule(id);
    setDrawer(false);
  };

  // Barra inferior del celular: Inicio + los 3 módulos más recientes + Menú
  const atajos = useMemo(() => {
    const ids = recientes.filter((id) => items.some((i) => i.id === id));
    const relleno = items.map((i) => i.id).filter((id) => !ids.includes(id));
    return [...ids, ...relleno].slice(0, 3).map(itemPorId);
  }, [recientes, items]);

  return (
    <div className="h-dvh w-full flex bg-[#0a0a0c] text-zinc-100 font-sans antialiased overflow-hidden selection:bg-[#FF5A00]/30 selection:text-white print:h-auto print:block print:bg-white print:overflow-visible">
      {/* ESCRITORIO: menú fijo */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#0e0e11] border-r border-white/[0.06] transition-[width] duration-300 ease-out print:hidden ${colapsado ? "w-[76px]" : "w-[268px]"}`}
      >
        <div
          className={`flex items-center h-16 shrink-0 ${colapsado ? "justify-center" : "px-5 gap-3"}`}
        >
          <img
            src={logo}
            alt="Conoflex"
            className="w-9 h-9 rounded-full shrink-0"
          />
          {!colapsado && (
            <div className="min-w-0">
              <p className="font-extrabold italic text-[17px] tracking-tight leading-none text-white">
                Conoflex
              </p>
              <p className="text-xs text-zinc-500 mt-1 leading-none">
                Gestión de producción
              </p>
            </div>
          )}
        </div>
        <MenuCompleto
          items={items}
          activeModule={activeModule}
          colapsado={colapsado}
          onElegir={ir}
        />
        <button
          onClick={alternarMenu}
          className={`mx-3 mb-2 flex items-center gap-3 h-9 rounded-xl text-xs text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-colors ${colapsado ? "justify-center" : "px-3"}`}
          aria-label={colapsado ? "Expandir menú" : "Achicar menú"}
        >
          {colapsado ? (
            <PanelLeftOpen size={17} />
          ) : (
            <>
              <PanelLeftClose size={17} /> Achicar menú
            </>
          )}
        </button>
        <Usuario
          usuario={usuarioActual}
          onLogout={onLogout}
          colapsado={colapsado}
        />
      </aside>

      {/* MÓVIL: cajón con todos los módulos */}
      <div
        className={`lg:hidden fixed inset-0 z-[100] transition-opacity duration-200 print:hidden ${drawer ? "opacity-100 visible bg-black/70 backdrop-blur-sm" : "opacity-0 invisible"}`}
        onClick={() => setDrawer(false)}
      >
        <div
          className={`absolute left-0 top-0 h-full w-[86vw] max-w-[320px] bg-[#0e0e11] border-r border-white/10 flex flex-col pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-out ${drawer ? "translate-x-0" : "-translate-x-full"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center h-16 px-5 gap-3 shrink-0">
            <img src={logo} alt="" className="w-9 h-9 rounded-full" />
            <p className="font-extrabold italic text-[17px] tracking-tight text-white flex-1">
              Conoflex
            </p>
            <button
              onClick={() => setDrawer(false)}
              aria-label="Cerrar menú"
              className="p-2 rounded-lg text-zinc-400 hover:bg-white/5"
            >
              <X size={20} />
            </button>
          </div>
          <MenuCompleto
            items={items}
            activeModule={activeModule}
            colapsado={false}
            onElegir={ir}
          />
          <Usuario
            usuario={usuarioActual}
            onLogout={onLogout}
            colapsado={false}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col print:block">
        {/* BARRA SUPERIOR */}
        <header className="cf-topbar h-14 md:h-16 shrink-0 flex items-center gap-3 px-3 md:px-6 pt-[env(safe-area-inset-top)] box-content border-b border-white/[0.06] bg-[#0e0e11]/90 backdrop-blur z-30 print:hidden">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Abrir menú"
            className="lg:hidden p-2 -ml-1 rounded-lg text-zinc-300 hover:bg-white/5"
          >
            <Menu size={22} />
          </button>
          <img
            src={logo}
            alt=""
            className="lg:hidden w-8 h-8 rounded-full shrink-0"
          />
          <div className="min-w-0 flex-1">
            {grupoActual && (
              <p className="hidden lg:block text-xs text-zinc-500 leading-none mb-1">
                {grupoActual.label}
              </p>
            )}
            <p
              className="text-[15px] md:text-lg font-bold text-white truncate leading-tight"
              style={{ fontStretch: "110%" }}
            >
              {actual?.label || "Conoflex"}
            </p>
          </div>

          <Campanita usuarioActual={usuarioActual} />

          <button
            onClick={() => setPaleta(true)}
            className="flex items-center gap-2 h-9 px-2.5 md:px-3 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/20 transition-colors"
            aria-label="Buscar módulo"
          >
            <Search size={16} />
            <span className="hidden md:inline text-[13px]">Buscar módulo</span>
            <kbd className="hidden lg:inline text-[11px] text-zinc-500 border border-white/10 rounded px-1.5">
              Ctrl K
            </kbd>
          </button>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative bg-[#0a0a0c] print:bg-white print:overflow-visible">
          <motion.div
            key={activeModule}
            className="h-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </main>

        {/* BARRA INFERIOR (celular) */}
        <nav
          className="cf-bottomnav lg:hidden shrink-0 grid grid-cols-5 border-t border-white/[0.08] bg-[#0e0e11] pb-[env(safe-area-inset-bottom)] z-30 print:hidden"
          aria-label="Accesos rápidos"
        >
          {[INICIO, ...atajos].map((it) => {
            const Icon = it.icon;
            const activo = activeModule === it.id;
            return (
              <button
                key={it.id}
                onClick={() => ir(it.id)}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] ${activo ? "text-white" : "text-zinc-500"}`}
              >
                {activo && (
                  <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-[#FF5A00]" />
                )}
                <Icon size={20} className={activo ? "text-[#FF5A00]" : ""} />
                <span className="text-[10.5px] font-medium max-w-full px-1 truncate">
                  {it.corto || it.label}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setDrawer(true)}
            className="flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-zinc-500"
          >
            <Ellipsis size={20} />
            <span className="text-[10.5px] font-medium">Más</span>
          </button>
        </nav>
      </div>

      <CommandPalette
        abierto={paleta}
        onCerrar={() => setPaleta(false)}
        items={items}
        onElegir={ir}
      />
    </div>
  );
}
