import { useState } from "react";
import { Lock, Mail, ArrowRight, Eye, EyeOff } from "lucide-react";

import logo from "./assets/logo.svg"; // <-- IMPORTACIÓN DEL LOGO PARA EL LOGIN

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
  const [verClave, setVerClave] = useState(false);

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
    <div className="min-h-dvh bg-[#0a0a0c] text-zinc-100 font-sans grid lg:grid-cols-[1.1fr_1fr]">
      {/* Escena: una ruta de noche. La línea central avanza hacia quien mira. */}
      <aside className="relative hidden lg:flex flex-col overflow-hidden bg-[#08080a] p-12 border-r border-white/[0.06]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 420px at 50% 78%, rgba(255,90,0,0.28), transparent 70%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-[44%] [perspective:520px] overflow-hidden">
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-20%] w-[160%] h-[190%] origin-bottom [transform:rotateX(62deg)] bg-[#121216]">
            <div className="cf-ruta absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3.2%]" />
            <div className="absolute left-[18%] top-0 bottom-0 w-[1.2%] bg-white/70" />
            <div className="absolute right-[18%] top-0 bottom-0 w-[1.2%] bg-white/70" />
          </div>
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#08080a] to-transparent" />
        </div>
        <div className="relative flex items-center gap-3">
          <img src={logo} alt="" className="w-11 h-11 rounded-full" />
          <span className="font-extrabold italic text-xl tracking-tight">
            Conoflex
          </span>
        </div>
        <div className="relative max-w-md mt-[14vh]">
          <h2
            className="text-5xl font-extrabold leading-[1.02] tracking-tight"
            style={{ fontStretch: "118%" }}
          >
            Toda la planta,
            <br />
            en una sola pantalla.
          </h2>
          <p className="mt-4 text-zinc-400 text-base leading-relaxed">
            Producción, stock, pedidos y personal de Conoflex, con Connie para
            responder en el momento.
          </p>
        </div>
      </aside>

      <main className="relative flex items-center justify-center p-6 md:p-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div
          className="lg:hidden absolute inset-x-0 top-0 h-48 pointer-events-none"
          style={{
            background:
              "radial-gradient(420px 200px at 50% 0%, rgba(255,90,0,0.22), transparent 70%)",
          }}
        />
        <div className="relative w-full max-w-[400px]">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img src={logo} alt="Conoflex" className="w-16 h-16 rounded-full" />
            <span className="mt-3 font-extrabold italic text-2xl tracking-tight">
              Conoflex
            </span>
          </div>

          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ fontStretch: "112%" }}
          >
            Ingresá a tu cuenta
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Usá el email y la contraseña que te dio el administrador.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-zinc-300">Email</span>
              <div className="relative mt-1.5">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 bg-white/[0.04] border border-white/10 rounded-xl text-white pl-11 pr-4 text-[15px] focus:outline-none focus:border-[#FF5A00] focus:bg-white/[0.06] transition-colors"
                  placeholder="nombre@conoflex.com.ar"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-zinc-300">
                Contraseña
              </span>
              <div className="relative mt-1.5">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type={verClave ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 bg-white/[0.04] border border-white/10 rounded-xl text-white pl-11 pr-12 text-[15px] focus:outline-none focus:border-[#FF5A00] focus:bg-white/[0.06] transition-colors"
                  placeholder="Tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  aria-label={
                    verClave ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-white"
                >
                  {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm px-4 py-3"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="cf-brillo w-full h-12 rounded-xl bg-[#FF5A00] hover:bg-[#ff6d1f] text-black font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                "Verificando…"
              ) : (
                <>
                  Ingresar <ArrowRight size={18} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>
          <p className="mt-10 text-xs text-zinc-600 text-center">
            Conoflex Argentina · Seguridad vial
          </p>
        </div>
      </main>
    </div>
  );
}
