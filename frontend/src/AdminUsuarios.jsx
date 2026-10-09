import { useState, useEffect } from "react";
import {
  Users,
  ShieldCheck,
  Save,
  UserPlus,
  X,
  Lock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Briefcase,
  CheckSquare,
  Square,
} from "lucide-react";

const MODULOS_SISTEMA = [
  { id: "materias-primas", nombre: "Materias Primas" },
  { id: "proveedores", nombre: "Proveedores" },
  { id: "semielaborados", nombre: "Semielaborados" },
  { id: "reflectivas", nombre: "Reflectivas & Pegado" },
  { id: "ingenieria", nombre: "Ingeniería & BOM" },
  { id: "metricas", nombre: "Métricas & KPI" },
  { id: "planificacion", nombre: "Planificación OT" },
  { id: "carga-produccion", nombre: "Carga Producción" },
  { id: "pedidos", nombre: "Pedidos" },
  { id: "despachar-pedidos", nombre: "Despachar Pedidos" },
  { id: "comercial", nombre: "IA Comercial" },
  { id: "solicitudes-internas", nombre: "Solicitudes Internas" },
  { id: "planta-online", nombre: "Planta On-Line" },
];

export default function AdminUsuarios() {
  const [tab, setTab] = useState("USUARIOS");
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([
    "ADMIN",
    "PRODUCCION",
    "DEPOSITO",
    "COMERCIAL",
  ]);
  const [vendedoresDisponibles, setVendedoresDisponibles] = useState([]);
  const [permisosRoles, setPermisosRoles] = useState({});
  const [rolSeleccionado, setRolSeleccionado] = useState("PRODUCCION");

  const [modalCrearUser, setModalCrearUser] = useState(false);
  const [modalCrearRol, setModalCrearRol] = useState(false);
  const [modalPassOpen, setModalPassOpen] = useState(null);
  const [modalVendedoresUser, setModalVendedoresUser] = useState(null);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const [formUsuario, setFormUsuario] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "PRODUCCION",
    vendedores: [],
  });

  const [nuevoRolNombre, setNuevoRolNombre] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  const fetchUsuarios = async () => {
    try {
      const res = await fetch("/api/usuarios");
      if (res.ok) setUsuarios(await res.json());
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch("/api/roles");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setRoles(data);
      }
    } catch (err) {
      console.error("Error cargando roles:", err);
    }
  };

  const fetchVendedores = async () => {
    try {
      const res = await fetch("/api/estado-pedidos/vendedores");
      if (res.ok) {
        const data = await res.json();
        const lista = Array.isArray(data) ? data : data.vendedores || [];
        setVendedoresDisponibles(lista);
      }
    } catch (err) {
      console.error("Error cargando vendedores:", err);
    }
  };

  const fetchPermisos = async () => {
    try {
      const res = await fetch("/api/permisos");
      if (res.ok) setPermisosRoles(await res.json());
    } catch (err) {
      console.error("Error cargando permisos:", err);
    }
  };

  useEffect(() => {
    fetchUsuarios();
    fetchRoles();
    fetchVendedores();
    fetchPermisos();
  }, []);

  const handleAbrirCrearUsuario = () => {
    fetchVendedores();
    setModalCrearUser(true);
  };

  const handleAbrirEditarVendedores = (u) => {
    fetchVendedores();
    setModalVendedoresUser(u);
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formUsuario),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Usuario creado con éxito");
        setModalCrearUser(false);
        setFormUsuario({
          nombre: "",
          email: "",
          password: "",
          rol: roles[0] || "PRODUCCION",
          vendedores: [],
        });
        await fetchUsuarios();
      } else {
        showToast(data.error || "Error al crear usuario", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCrearRol = async (e) => {
    e.preventDefault();
    if (!nuevoRolNombre.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevoRolNombre }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Rol ${data.nombre} creado con éxito`);
        setNuevoRolNombre("");
        setModalCrearRol(false);
        await fetchRoles();
        await fetchPermisos();
        setRolSeleccionado(data.nombre);
      } else {
        showToast(data.error || "Error al crear el rol", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarRolUsuario = async (userId, nuevoRol) => {
    try {
      const res = await fetch(`/api/usuarios/${userId}/rol`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol: nuevoRol }),
      });
      if (res.ok) {
        showToast("Rol actualizado");
        await fetchUsuarios();
      } else {
        showToast("No se pudo cambiar el rol", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    }
  };

  const handleGuardarVendedoresUsuario = async () => {
    if (!modalVendedoresUser) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/usuarios/${modalVendedoresUser.id}/vendedores`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendedores: modalVendedoresUser.vendedores || [],
          }),
        },
      );
      if (res.ok) {
        showToast("Vendedores asignados guardados");
        setModalVendedoresUser(null);
        await fetchUsuarios();
      } else {
        showToast("Error al guardar vendedores", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarPassword = async (e) => {
    e.preventDefault();
    if (!nuevaPassword) return;
    try {
      const res = await fetch(`/api/usuarios/${modalPassOpen}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nuevaPassword }),
      });
      if (res.ok) {
        showToast("Contraseña modificada correctamente");
        setModalPassOpen(null);
        setNuevaPassword("");
      } else {
        showToast("Error al modificar contraseña", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    }
  };

  const toggleModuloPermiso = (moduloId) => {
    if (rolSeleccionado === "ADMIN") return;
    const listaActual = permisosRoles[rolSeleccionado] || [];
    let nuevaLista = listaActual.includes(moduloId)
      ? listaActual.filter((m) => m !== moduloId)
      : [...listaActual, moduloId];
    setPermisosRoles({ ...permisosRoles, [rolSeleccionado]: nuevaLista });
  };

  const handleGuardarPermisos = async () => {
    if (rolSeleccionado === "ADMIN") return;
    setLoading(true);
    try {
      const res = await fetch(`/api/permisos/${rolSeleccionado}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulos: permisosRoles[rolSeleccionado] || [] }),
      });
      if (res.ok) {
        showToast(`Permisos guardados para ${rolSeleccionado}`);
        await fetchPermisos();
      } else {
        showToast("Error al guardar permisos", "error");
      }
    } catch (err) {
      showToast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      {/* TOAST */}
      {toast && (
        <div
          className={`absolute top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-xl ${
            toast.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* CABECERA */}
      <div className="p-4 md:p-6 border-b border-slate-800/80 bg-slate-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide">
              Panel de Administrador
            </h1>
            <p className="text-xs text-slate-400">
              Gestión de usuarios, asignación de vendedores y roles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950/80 p-1 border border-slate-800 rounded-xl">
          <button
            onClick={() => setTab("USUARIOS")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              tab === "USUARIOS"
                ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users size={14} /> Usuarios
          </button>
          <button
            onClick={() => setTab("ROLES")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              tab === "ROLES"
                ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Lock size={14} /> Roles y Accesos
          </button>
        </div>
      </div>

      {/* TAB USUARIOS */}
      {tab === "USUARIOS" && (
        <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Cuentas Registradas ({usuarios.length})
            </h2>
            <button
              onClick={handleAbrirCrearUsuario}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 text-xs rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.25)] transition-all flex items-center gap-2 cursor-pointer"
            >
              <UserPlus size={14} /> Crear Usuario
            </button>
          </div>

          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Nombre / ID</th>
                  <th className="py-3 px-4">Email de Acceso</th>
                  <th className="py-3 px-4">Rol Asignado</th>
                  <th className="py-3 px-4">Vendedor(es) Asignados</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs">
                {usuarios.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      {u.nombre}
                      <span className="block text-[10px] text-slate-500 font-mono">
                        ID: #{u.id}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">
                      {u.email}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.rol}
                        onChange={(e) =>
                          handleCambiarRolUsuario(u.id, e.target.value)
                        }
                        className="bg-slate-900 border border-slate-700/60 text-cyan-400 font-bold text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleAbrirEditarVendedores(u)}
                        className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-amber-300 px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer font-mono"
                      >
                        <Briefcase size={12} className="text-amber-400" />
                        {u.vendedores && u.vendedores.length > 0
                          ? u.vendedores.join(", ")
                          : "Sin Asignar"}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setModalPassOpen(u.id)}
                        className="text-slate-400 hover:text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer"
                      >
                        Cambiar Pass
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB ROLES Y ACCESOS */}
      {tab === "ROLES" && (
        <div className="flex-1 flex flex-col md:flex-row p-4 md:p-6 gap-6 min-h-0 overflow-auto">
          <div className="w-full md:w-64 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Roles del Sistema
              </span>
              <button
                onClick={() => setModalCrearRol(true)}
                className="bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 p-1.5 rounded-lg transition-all cursor-pointer"
                title="Crear Nuevo Rol"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  onClick={() => setRolSeleccionado(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    rolSeleccionado === r
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                      : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span>{r}</span>
                  {r === "ADMIN" && (
                    <span className="text-[10px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded font-mono">
                      FULL
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 border border-slate-800/80 rounded-xl p-4 bg-slate-950/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase">
                    Permisos para:{" "}
                    <span className="text-cyan-400">{rolSeleccionado}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {rolSeleccionado === "ADMIN"
                      ? "El rol ADMIN posee acceso total irrestricto."
                      : "Marque los módulos que este rol podrá visualizar."}
                  </p>
                </div>

                {rolSeleccionado !== "ADMIN" && (
                  <button
                    onClick={handleGuardarPermisos}
                    disabled={loading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 text-xs rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save size={14} /> Guardar Cambios
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {MODULOS_SISTEMA.map((m) => {
                  const tieneAcceso =
                    rolSeleccionado === "ADMIN" ||
                    (permisosRoles[rolSeleccionado] || []).includes(m.id);

                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-medium transition-all ${
                        rolSeleccionado === "ADMIN"
                          ? "opacity-60 cursor-not-allowed bg-slate-900 border-slate-800"
                          : "cursor-pointer hover:border-slate-700 " +
                            (tieneAcceso
                              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
                              : "bg-slate-900/40 border-slate-800 text-slate-500")
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={tieneAcceso}
                        disabled={rolSeleccionado === "ADMIN"}
                        onChange={() => toggleModuloPermiso(m.id)}
                        className="rounded accent-cyan-500 cursor-pointer"
                      />
                      <span>{m.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR USUARIO */}
      {modalCrearUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setModalCrearUser(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <h3 className="text-sm font-bold uppercase text-slate-100 mb-4 flex items-center gap-2">
              <UserPlus size={16} className="text-cyan-400" /> Crear Nuevo
              Usuario
            </h3>
            <form
              onSubmit={handleCrearUsuario}
              className="flex flex-col gap-3 text-xs"
            >
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  value={formUsuario.nombre}
                  onChange={(e) =>
                    setFormUsuario({ ...formUsuario, nombre: e.target.value })
                  }
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold mb-1 block">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={formUsuario.email}
                  onChange={(e) =>
                    setFormUsuario({ ...formUsuario, email: e.target.value })
                  }
                  placeholder="usuario@conoflex.com.ar"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold mb-1 block">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={formUsuario.password}
                  onChange={(e) =>
                    setFormUsuario({ ...formUsuario, password: e.target.value })
                  }
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-semibold mb-1 block">
                  Rol Asignado
                </label>
                <select
                  value={formUsuario.rol}
                  onChange={(e) =>
                    setFormUsuario({ ...formUsuario, rol: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* SELECCIÓN DE VENDEDORES EN CREACIÓN */}
              <div>
                <label className="text-slate-400 font-semibold mb-1.5 block">
                  Vendedor(es) Asignados (Despacho)
                </label>
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 border border-slate-800 rounded-xl bg-slate-950">
                  {vendedoresDisponibles.length === 0 ? (
                    <span className="text-[11px] text-slate-500 italic p-1">
                      Cargando vendedores de la base de datos...
                    </span>
                  ) : (
                    vendedoresDisponibles.map((v) => {
                      const checked = formUsuario.vendedores.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const nuevaLista = checked
                              ? formUsuario.vendedores.filter((x) => x !== v)
                              : [...formUsuario.vendedores, v];
                            setFormUsuario({
                              ...formUsuario,
                              vendedores: nuevaLista,
                            });
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer font-mono ${
                            checked
                              ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold"
                              : "bg-slate-900 border border-slate-800 text-slate-400"
                          }`}
                        >
                          {checked ? (
                            <CheckSquare size={12} className="text-amber-400" />
                          ) : (
                            <Square size={12} />
                          )}
                          {v}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] cursor-pointer"
              >
                {loading ? "Creando..." : "Guardar Usuario"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR VENDEDORES A USUARIO EXISTENTE */}
      {modalVendedoresUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => setModalVendedoresUser(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <h3 className="text-sm font-bold uppercase text-slate-100 mb-1 flex items-center gap-2">
              <Briefcase size={16} className="text-amber-400" /> Asignar
              Vendedores
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Usuario:{" "}
              <strong className="text-cyan-300">
                {modalVendedoresUser.nombre}
              </strong>
            </p>

            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 border border-slate-800 rounded-xl bg-slate-950 mb-4 font-mono">
              {vendedoresDisponibles.length === 0 ? (
                <span className="text-[11px] text-slate-500 italic p-1">
                  Cargando vendedores de la base de datos...
                </span>
              ) : (
                vendedoresDisponibles.map((v) => {
                  const list = modalVendedoresUser.vendedores || [];
                  const checked = list.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        const nuevaLista = checked
                          ? list.filter((x) => x !== v)
                          : [...list, v];
                        setModalVendedoresUser({
                          ...modalVendedoresUser,
                          vendedores: nuevaLista,
                        });
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                        checked
                          ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold"
                          : "bg-slate-900 border border-slate-800 text-slate-400"
                      }`}
                    >
                      {checked ? (
                        <CheckSquare size={13} className="text-amber-400" />
                      ) : (
                        <Square size={13} />
                      )}
                      {v}
                    </button>
                  );
                })
              )}
            </div>

            <button
              onClick={handleGuardarVendedoresUsuario}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer"
            >
              {loading ? "Guardando..." : "Guardar Vendedores Asignados"}
            </button>
          </div>
        </div>
      )}

      {/* MODAL CREAR ROL */}
      {modalCrearRol && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
            <button
              onClick={() => setModalCrearRol(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <h3 className="text-sm font-bold uppercase text-slate-100 mb-4 flex items-center gap-2">
              <Plus size={16} className="text-cyan-400" /> Crear Nuevo Rol
            </h3>
            <form
              onSubmit={handleCrearRol}
              className="flex flex-col gap-3 text-xs"
            >
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">
                  Nombre del Rol
                </label>
                <input
                  type="text"
                  required
                  value={nuevoRolNombre}
                  onChange={(e) => setNuevoRolNombre(e.target.value)}
                  placeholder="Ej: SUPERVISOR, LOGISTICA..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 uppercase font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] cursor-pointer"
              >
                {loading ? "Guardando..." : "Crear Rol"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR PASS */}
      {modalPassOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
            <button
              onClick={() => setModalPassOpen(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <h3 className="text-sm font-bold uppercase text-slate-100 mb-4 flex items-center gap-2">
              <Lock size={16} className="text-cyan-400" /> Modificar Contraseña
            </h3>
            <form
              onSubmit={handleCambiarPassword}
              className="flex flex-col gap-3 text-xs"
            >
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <button
                type="submit"
                className="mt-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] cursor-pointer"
              >
                Guardar Nueva Contraseña
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
