import { useState } from "react";
import {
  Lock,
  Mail,
  ShieldCheck,
  ChevronRight,
  KeyRound,
  Cpu,
  Terminal,
} from "lucide-react";

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
    <div className="min-h-screen bg-black flex items-center justify-center p-4 md:p-8 font-sans selection:bg-[#FF5A00]/40 selection:text-white relative overflow-hidden select-none">
      {/* 1. ILUMINACIÓN Y RETÍCULA INDUSTRIAL DE FONDO */}
      <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:28px_28px] opacity-40 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-[#FF5A00]/15 rounded-full blur-[160px] pointer-events-none animate-pulse" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#FFD700]/10 rounded-full blur-[130px] pointer-events-none" />

      {/* 2. CARD MÁXIMA PRESENCIA */}
      <div className="w-full max-w-lg bg-[#050505] border-2 border-zinc-800 shadow-[0_0_80px_rgba(0,0,0,0.9)] relative z-10 overflow-hidden">
        {/* FRANJA DE ACENTO SUPERIOR MULTICOLOR INDUSTRIAL */}
        <div className="h-2 bg-gradient-to-r from-[#FF5A00] via-[#FFD700] to-[#FF5A00]" />

        <div className="p-8 md:p-12 space-y-8">
          {/* BRANDING HERO LLAMATIVO */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 flex items-center justify-center mb-2 shadow-[0_0_35px_rgba(255,90,0,0.2)] group transition-all duration-300 hover:border-[#FF5A00] hover:scale-105">
              <img srcset={logo} alt="Logo"/>
            </div>

            <div>
              <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white uppercase font-sans leading-none">
                CONOFLEX<span className="text-[#FF5A00]">.</span>
              </h1>
              <div className="inline-block mt-3 px-3.5 py-1 bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] text-xs font-black tracking-[0.25em] uppercase">
                App de Gestión
              </div>
            </div>
          </div>

          {/* FORMULARIO CON CAMPOS Y BOTONES GRANDES */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* CAMPO EMAIL / USUARIO */}
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                <span>EMAIL / USUARIO</span>
                <span className="text-[#FF5A00] text-[10px]">* REQUERIDO</span>
              </label>
              <div className="relative">
                <Mail
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border-2 border-zinc-800 text-white pl-12 pr-4 py-4 text-sm font-bold focus:outline-none focus:border-[#FF5A00] transition-all uppercase tracking-wider"
                  placeholder="USUARIO@CONOFLEX.COM.AR"
                />
              </div>
            </div>

            {/* CAMPO CONTRASEÑA */}
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                <span>CONTRASEÑA</span>
                <KeyRound size={12} className="text-zinc-600" />
              </label>
              <div className="relative">
                <Lock
                  size={20}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border-2 border-zinc-800 text-white pl-12 pr-4 py-4 text-sm font-bold focus:outline-none focus:border-[#FF5A00] transition-all tracking-widest"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {/* BANNER DE ERROR ROJO NEÓN POTENTE */}
            {error && (
              <div className="bg-[#FF0055]/15 border-2 border-[#FF0055] text-[#FF0055] text-xs font-extrabold text-center py-3.5 px-4 uppercase tracking-widest shadow-[0_0_25px_rgba(255,0,85,0.2)]">
                {error}
              </div>
            )}

            {/* BOTÓN PRINCIPAL GIGANTE (AMARILLO NEÓN CON DESTEC DE HOVER) */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-[#FFD700] hover:bg-white text-black font-black text-sm md:text-base uppercase tracking-widest py-5 transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-40 active:scale-[0.98] shadow-[0_0_30px_rgba(255,215,0,0.25)] mt-4"
            >
              <span>
                {loading
                  ? "VERIFICANDO CREDANCIALES..."
                  : "INGRESAR AL SISTEMA"}
              </span>
              {!loading && <ChevronRight size={22} strokeWidth={3.5} />}
            </button>
          </form>

          {/* FOOTER TÉCNICO INFORMATIVO */}
          <div className="pt-6 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Terminal size={12} className="text-[#FF5A00]" /> CONOFLEX®
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
