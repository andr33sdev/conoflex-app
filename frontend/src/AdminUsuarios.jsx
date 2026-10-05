import { useState, useEffect } from "react";
import {
  Users,
  Key,
  ShieldCheck,
  Settings2,
  Save,
  UserPlus,
  X,
  Lock,
  Mail,
  User,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ==============================================================================
// CONFIGURACIÓN DE URL DEL BACKEND (FEROZO / LOCALHOST)
// ==============================================================================
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  if (
    typeof window !== "undefined" &&
    (window.location.port === "5173" || window.location.port === "5174")
  ) {
    return `http://localhost:3000${cleanPath}`;
  }
  return `${API_BASE_URL}${cleanPath}`;
};

// ==============================================================================
// ESTADOS INICIALES (Sólo el Admin Base + Estructura de Permisos)
// ==============================================================================
const INITIAL_USUARIOS = [
  {
    id: 1,
    nombre: "Administrador Conoflex",
    email: "admin@conoflex.com.ar",
    rol: "ADMIN",
  },
];

const MOCK_MODULOS = [
  { id: "materias-primas", nombre: "Materias Primas" },
  { id: "semielaborados", nombre: "Semielaborados" },
  { id: "reflectivas", label: "Reflectivas & Pegado" },
  { id: "ingenieria", nombre: "Ingeniería & BOM" },
  { id: "metricas", nombre: "Métricas & KPI" },
  { id: "planificacion", nombre: "Planificación OT" },
  { id: "carga-produccion", nombre: "Carga Producción" },
  { id: "solicitudes-internas", nombre: "Solicitudes Internas" },
  { id: "planta-online", nombre: "Planta On-Line" },
];

const MOCK_ROLES = ["ADMIN", "PRODUCCION", "DEPOSITO"];

const PERMISOS_INICIALES = {
  ADMIN: ["*"], // Acceso Total
  PRODUCCION: [
    "planta-online",
    "planificacion",
    "carga-produccion",
    "materias-primas",
  ],
  DEPOSITO: ["solicitudes-internas", "semielaborados", "materias-primas"],
};

export default function AdminUsuarios() {
  const [tab, setTab] = useState("USUARIOS"); // 'USUARIOS' | 'PERMISOS'
  const [usuarios, setUsuarios] = useState(INITIAL_USUARIOS);
  const [permisosRoles, setPermisosRoles] = useState(PERMISOS_INICIALES);
  const [rolSeleccionado, setRolSeleccionado] = useState("PRODUCCION");

  // ESTADOS PARA MODALES
  const [modalCrearOpen, setModalCrearOpen] = useState(false);
  const [modalPassOpen, setModalPassOpen] = useState(null); // Recibe el objeto del usuario a editar
  const [loadingForm, setLoadingForm] = useState(false);

  // FORMULARIOS
  const [formUsuario, setFormUsuario] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "PRODUCCION",
  });
  const [nuevaPassword, setNuevaPassword] = useState("");

  // FETCH INICIAL DE USUARIOS DESDE BD
  useEffect(() => {
    const fetchUsuarios = async () => {
      try {
        const res = await fetch(getApiUrl("/api/usuarios"));
        if (res.ok) {
          const data = await res.json();
          // Asegurarse de no duplicar al admin si ya viene en la BD
          if (data && data.length > 0) {
            setUsuarios(data);
          }
        }
      } catch (error) {
        console.warn(
          "Usando usuarios locales. El backend no respondió:",
          error,
        );
      }
    };
    fetchUsuarios();
  }, []);

  // ==========================================
  // HANDLERS DE ACCIONES
  // ==========================================

  // 1. Cambiar Rol Rápido
  const cambiarRolUsuario = async (userId, nuevoRol) => {
    setUsuarios(
      usuarios.map((u) => (u.id === userId ? { ...u, rol: nuevoRol } : u)),
    );

    try {
      await fetch(getApiUrl(`/api/usuarios/${userId}/rol`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: nuevoRol }),
      });
    } catch (err) {
      console.error("Error al guardar rol en BD", err);
    }
  };

  // 2. Crear Nuevo Usuario
  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setLoadingForm(true);

    try {
      // Intento de guardado real en la BD
      const res = await fetch(getApiUrl("/api/usuarios"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formUsuario),
      });

      let newUser;
      if (res.ok) {
        newUser = await res.json();
      } else {
        // Fallback visual si falla el backend o no está lista la ruta
        newUser = {
          id: Math.floor(Math.random() * 10000),
          nombre: formUsuario.nombre,
          email: formUsuario.email,
          rol: formUsuario.rol,
        };
      }

      setUsuarios([...usuarios, newUser]);
      setModalCrearOpen(false);
      setFormUsuario({
        nombre: "",
        email: "",
        password: "",
        rol: "PRODUCCION",
      });
    } catch (error) {
      console.error("Error creando usuario", error);
      // Fallback visual
      setUsuarios([
        ...usuarios,
        { id: Math.floor(Math.random() * 10000), ...formUsuario },
      ]);
      setModalCrearOpen(false);
    } finally {
      setLoadingForm(false);
    }
  };

  // 3. Forzar Cambio de Contraseña (Como Admin, sin saber la anterior)
  const handleEditarPassword = async (e) => {
    e.preventDefault();
    if (!nuevaPassword || !modalPassOpen) return;
    setLoadingForm(true);

    try {
      await fetch(getApiUrl(`/api/usuarios/${modalPassOpen.id}/password`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nuevaPassword }),
      });
      // Visualmente no cambia nada en la tabla, pero se cerraría con éxito
      setModalPassOpen(null);
      setNuevaPassword("");
    } catch (error) {
      console.error("Error cambiando password", error);
      // Fallback visual
      setModalPassOpen(null);
      setNuevaPassword("");
    } finally {
      setLoadingForm(false);
    }
  };

  // 4. Activar/Desactivar permisos por rol
  const togglePermiso = (moduloId) => {
    setPermisosRoles((prev) => {
      const actuales = prev[rolSeleccionado] || [];
      const tiene = actuales.includes(moduloId);
      const nuevos = tiene
        ? actuales.filter((m) => m !== moduloId)
        : [...actuales, moduloId];
      return { ...prev, [rolSeleccionado]: nuevos };
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      {/* CABECERA SUPERIOR */}
      <div className="bg-[#0f172a]/90 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <ShieldCheck size={22} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
              PANEL DE ADMINISTRADOR
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Gestión de credenciales y accesos al sistema
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setTab("USUARIOS")}
            className={`px-3.5 py-1.5 rounded-xl border transition font-bold flex items-center gap-2 ${
              tab === "USUARIOS"
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-[#090d16] border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Users size={14} /> Usuarios
          </button>
          <button
            onClick={() => setTab("PERMISOS")}
            className={`px-3.5 py-1.5 rounded-xl border transition font-bold flex items-center gap-2 ${
              tab === "PERMISOS"
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-[#090d16] border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Key size={14} /> Roles y Accesos
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* ======================================================== */}
        {/* PESTAÑA: USUARIOS */}
        {/* ======================================================== */}
        {tab === "USUARIOS" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex justify-between items-end mb-6 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase font-mono">
                  Control de Cuentas
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Asignación de roles al personal.
                </p>
              </div>
              <button
                onClick={() => setModalCrearOpen(true)}
                className="bg-transparent border border-slate-700 hover:border-cyan-500 hover:text-cyan-400 text-slate-300 font-mono text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer"
              >
                <UserPlus size={14} /> Crear Usuario
              </button>
            </div>

            <div className="bg-[#0e1422] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-4 w-64">Nombre / ID</th>
                    <th className="p-4">Email de Acceso</th>
                    <th className="p-4 w-48">Rol Asignado</th>
                    <th className="p-4 w-32 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {usuarios.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-[#121824] transition-colors"
                    >
                      <td className="p-4">
                        <span className="text-white font-bold block font-sans truncate">
                          {u.nombre}
                        </span>
                        <span className="text-slate-500 text-[10px]">
                          ID: {u.id}
                        </span>
                      </td>
                      <td className="p-4 text-slate-300">{u.email}</td>
                      <td className="p-4">
                        <select
                          value={u.rol}
                          disabled={u.rol === "ADMIN"} // Protección para no quitarle el admin al superusuario accidentalmente
                          onChange={(e) =>
                            cambiarRolUsuario(u.id, e.target.value)
                          }
                          className={`w-full bg-[#070a12] border border-slate-700 font-bold rounded-lg px-3 py-1.5 outline-none cursor-pointer ${
                            u.rol === "ADMIN"
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {MOCK_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setModalPassOpen(u)}
                          className="text-slate-500 hover:text-cyan-400 transition cursor-pointer"
                        >
                          Editar Pass
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PESTAÑA: PERMISOS */}
        {/* ======================================================== */}
        {tab === "PERMISOS" && (
          <div className="max-w-5xl mx-auto flex gap-6">
            <div className="w-64 shrink-0 space-y-3">
              <h3 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider pl-2">
                Seleccionar Rol
              </h3>
              <div className="space-y-1.5">
                {MOCK_ROLES.filter((r) => r !== "ADMIN").map((rol) => (
                  <button
                    key={rol}
                    onClick={() => setRolSeleccionado(rol)}
                    className={`w-full text-left px-4 py-3 rounded-xl font-mono text-xs uppercase font-bold transition-all cursor-pointer ${
                      rolSeleccionado === rol
                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                        : "bg-[#0e1422] text-slate-400 border border-slate-800 hover:bg-[#121824]"
                    }`}
                  >
                    {rol}
                  </button>
                ))}
                <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400/50 font-mono text-xs uppercase cursor-not-allowed">
                  ADMIN (Acceso Total Fijo)
                </div>
              </div>
            </div>

            <div className="flex-1 bg-[#0e1422] border border-slate-800 p-6 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase font-mono text-cyan-400 flex items-center gap-2">
                    <Settings2 size={16} /> PERMISOS DE {rolSeleccionado}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Habilitá los módulos que este rol podrá ver en el sidebar.
                  </p>
                </div>
                <button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition cursor-pointer">
                  <Save size={14} /> Guardar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {MOCK_MODULOS.map((mod) => {
                  const tieneAcceso = permisosRoles[rolSeleccionado]?.includes(
                    mod.id,
                  );
                  return (
                    <div
                      key={mod.id}
                      onClick={() => togglePermiso(mod.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                        tieneAcceso
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : "bg-[#070a12] border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <span
                        className={`text-xs font-mono font-bold ${tieneAcceso ? "text-emerald-400" : "text-slate-500"}`}
                      >
                        {mod.nombre || mod.label}
                      </span>
                      <div
                        className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors ${tieneAcceso ? "bg-emerald-500" : "bg-slate-700"}`}
                      >
                        <div
                          className={`w-3 h-3 bg-white rounded-full shadow-md transition-transform ${tieneAcceso ? "translate-x-4" : "translate-x-0"}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: CREAR USUARIO */}
      {/* ======================================================== */}
      {modalCrearOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <UserPlus size={18} className="text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  ALTA DE USUARIO
                </h3>
              </div>
              <button
                onClick={() => setModalCrearOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCrearUsuario} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                  Nombre Completo
                </label>
                <div className="relative">
                  <User
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    required
                    value={formUsuario.nombre}
                    onChange={(e) =>
                      setFormUsuario({ ...formUsuario, nombre: e.target.value })
                    }
                    className="w-full bg-[#070a12] border border-slate-700 text-white pl-9 pr-3 py-2.5 rounded-xl outline-none focus:border-emerald-500 transition-colors font-sans"
                    placeholder="Ej: Pedro Planta"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                  Email / Cuenta
                </label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="email"
                    required
                    value={formUsuario.email}
                    onChange={(e) =>
                      setFormUsuario({ ...formUsuario, email: e.target.value })
                    }
                    className="w-full bg-[#070a12] border border-slate-700 text-white pl-9 pr-3 py-2.5 rounded-xl outline-none focus:border-emerald-500 transition-colors font-mono"
                    placeholder="usuario@conoflex.com.ar"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                  Contraseña de Acceso
                </label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    required
                    value={formUsuario.password}
                    onChange={(e) =>
                      setFormUsuario({
                        ...formUsuario,
                        password: e.target.value,
                      })
                    }
                    className="w-full bg-[#070a12] border border-slate-700 text-white pl-9 pr-3 py-2.5 rounded-xl outline-none focus:border-emerald-500 transition-colors font-mono"
                    placeholder="Clave inicial"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                  Rol Operativo
                </label>
                <select
                  value={formUsuario.rol}
                  onChange={(e) =>
                    setFormUsuario({ ...formUsuario, rol: e.target.value })
                  }
                  className="w-full bg-[#070a12] border border-slate-700 text-emerald-400 font-bold px-3 py-2.5 rounded-xl outline-none cursor-pointer"
                >
                  {MOCK_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalCrearOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white font-mono font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    loadingForm ||
                    !formUsuario.nombre ||
                    !formUsuario.email ||
                    !formUsuario.password
                  }
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 font-bold font-mono px-5 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  <Save size={14} />{" "}
                  {loadingForm ? "Guardando..." : "Crear Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDITAR CONTRASEÑA (SOBREESCRITURA ADMIN) */}
      {/* ======================================================== */}
      {modalPassOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <Key size={18} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    FORZAR NUEVA CLAVE
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Acción administrativa
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setModalPassOpen(null);
                  setNuevaPassword("");
                }}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEditarPassword} className="p-6 space-y-5">
              <div className="bg-[#070a12] border border-slate-800 p-4 rounded-xl flex items-start gap-3">
                <AlertCircle
                  size={20}
                  className="text-amber-400 shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-slate-300">
                    Estás por sobreescribir la contraseña del usuario:
                  </p>
                  <strong className="text-white block mt-1">
                    {modalPassOpen.nombre}
                  </strong>
                  <span className="text-[10px] text-slate-500 font-mono block">
                    [{modalPassOpen.email}]
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                  Ingresar Nueva Contraseña
                </label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    required
                    value={nuevaPassword}
                    onChange={(e) => setNuevaPassword(e.target.value)}
                    className="w-full bg-[#070a12] border border-amber-500/30 text-amber-400 pl-9 pr-3 py-3 rounded-xl outline-none focus:border-amber-400 transition-colors font-mono font-bold text-sm"
                    placeholder="Escribí la nueva clave acá"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalPassOpen(null);
                    setNuevaPassword("");
                  }}
                  className="px-4 py-2 text-slate-400 hover:text-white font-mono font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingForm || !nuevaPassword}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 font-bold font-mono px-5 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                  <CheckCircle2 size={15} />{" "}
                  {loadingForm ? "Actualizando..." : "Sobreescribir Clave"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
