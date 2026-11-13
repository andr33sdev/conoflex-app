// Constantes y formatos del módulo Proyectos y pruebas.
import { Cog, FlaskConical, Lightbulb, MoreHorizontal, Target, TrendingUp } from "lucide-react";

export const TIPOS = {
  PRUEBA: { texto: "Prueba", icono: FlaskConical, color: "text-sky-300", fondo: "bg-sky-500/10", ayuda: "Probar algo nuevo: un material, una pintura, un proveedor" },
  MAQUINA: { texto: "Máquina", icono: Cog, color: "text-violet-300", fondo: "bg-violet-500/10", ayuda: "Una máquina nueva, una puesta en marcha, un ajuste" },
  OBJETIVO: { texto: "Objetivo", icono: Target, color: "text-[#FF5A00]", fondo: "bg-[#FF5A00]/10", ayuda: "Algo que nos propusimos lograr" },
  MEJORA: { texto: "Mejora", icono: TrendingUp, color: "text-emerald-300", fondo: "bg-emerald-500/10", ayuda: "Mejorar un proceso, un puesto, un layout" },
  IDEA: { texto: "Idea", icono: Lightbulb, color: "text-amber-300", fondo: "bg-amber-500/10", ayuda: "Algo para pensar más adelante" },
  OTRO: { texto: "Otro", icono: MoreHorizontal, color: "text-zinc-300", fondo: "bg-zinc-500/10", ayuda: "Cualquier otra cosa a seguir" },
};

export const ESTADOS = {
  IDEA: { texto: "Idea", clase: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  EN_CURSO: { texto: "En curso", clase: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  ESPERANDO: { texto: "Esperando a alguien", clase: "bg-violet-500/10 text-violet-300 border-violet-500/30" },
  PAUSADO: { texto: "Pausado", clase: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" },
  LOGRADO: { texto: "Logrado", clase: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  DESCARTADO: { texto: "Descartado", clase: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
};
export const CERRADOS = new Set(["LOGRADO", "DESCARTADO"]);

export const PRUEBA = {
  PENDIENTE: { texto: "Pendiente", clase: "bg-zinc-500/10 text-zinc-300 border-zinc-600/40" },
  APROBADA: { texto: "Aprobada", clase: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40" },
  RECHAZADA: { texto: "Rechazada", clase: "bg-rose-500/10 text-rose-300 border-rose-500/40" },
};

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fechaCorta = (f) => {
  if (!f) return "";
  const d = new Date(String(f).length <= 10 ? `${String(f).slice(0, 10)}T12:00:00` : f);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};
export const fechaLarga = (f) => {
  if (!f) return "";
  const d = new Date(String(f).length <= 10 ? `${String(f).slice(0, 10)}T12:00:00` : f);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
};
export const fechaHora = (f) => {
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
export const hace = (f) => {
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return dias < 60 ? `hace ${dias} día${dias === 1 ? "" : "s"}` : `el ${fechaLarga(f)}`;
};
/** "vence hoy", "venció hace 3 días", "en 5 días". */
export const vencimiento = (f) => {
  if (!f) return null;
  const dias = Math.round((new Date(`${f}T12:00:00`) - new Date(`${hoyISO()}T12:00:00`)) / 86400000);
  if (dias === 0) return { texto: "vence hoy", tarde: false, hoy: true };
  if (dias < 0) return { texto: `venció hace ${-dias} día${dias === -1 ? "" : "s"}`, tarde: true };
  return { texto: dias === 1 ? "mañana" : `en ${dias} días`, tarde: false };
};

export const campo = "w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 [color-scheme:dark]";
export const etiqueta = "flex flex-col gap-1.5 text-xs font-semibold text-zinc-400";
export const botonPrimario = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#FF5A00] hover:bg-[#ff7a2e] text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
export const botonSecundario = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-zinc-800 hover:border-zinc-600 text-zinc-200 cursor-pointer disabled:opacity-50 transition-colors";
