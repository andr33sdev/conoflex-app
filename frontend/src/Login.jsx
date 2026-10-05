import { useState } from "react";
import { Lock, Mail, ShieldCheck, ChevronRight } from "lucide-react";

// CONFIGURACIÓN DE URL BASE
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE_URL}${cleanPath}`;
};

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // PETICIÓN REAL AL BACKEND NODE EN FEROZO
      const res = await fetch(getApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.token) {
          localStorage.setItem("token", data.token);
        }
        onLogin(data.usuario);
      } else {
        setError(data.error || "Usuario o contraseña incorrectos.");
      }
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      setError("Error de conexión con el servidor Ferozo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#04060c] flex items-center justify-center p-4 font-sans selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-md bg-[#090d16] border border-slate-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden relative">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-emerald-400" />

        <div className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <ShieldCheck size={28} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold font-mono text-white tracking-widest uppercase">
              CONOFLEX
            </h1>
            <p className="text-emerald-400 font-mono text-[10px] tracking-[0.2em] mt-1">
              SISTEMA INTEGRAL
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                Email / Usuario
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#070a12] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl outline-none focus:border-emerald-500/50 transition-colors font-mono text-sm"
                  placeholder="usuario@conoflex.com.ar"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-slate-400 uppercase ml-1">
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#070a12] border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl outline-none focus:border-emerald-500/50 transition-colors font-mono text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center py-2 rounded-lg font-mono">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono px-4 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            >
              {loading ? "VERIFICANDO..." : "INGRESAR AL SISTEMA"}
              {!loading && <ChevronRight size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
