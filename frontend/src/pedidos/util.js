// Utilidades del módulo Pedidos (fechas, avance, estados).
export const getNowLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const formatFechaArg = (raw) => {
  if (!raw || raw === "--") return "--";
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    const parts = String(raw).split(" ")[0].split("T")[0].split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(raw);
  }
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

export const formatHoraArg = (raw) => {
  if (!raw || raw === "--") return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(11, 16);
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

export const nroOP = (op) => `OP-${String(op).replace(/^OP-/i, "")}`;

export const avancePedido = (p) => {
  const total = Number(p.cantidad_total) || 0;
  const hecho = Number(p.cantidad_completada) || 0;
  return { total, hecho, falta: Math.max(0, total - hecho), pct: total > 0 ? Math.min(100, Math.round((hecho / total) * 100)) : 0 };
};

export const ESTADOS = {
  PENDIENTE: { texto: "Pendiente", clase: "text-zinc-300 bg-white/[0.07] border-white/[0.12]", punto: "bg-zinc-400" },
  EN_PROCESO: { texto: "En proceso", clase: "text-[#ff8a4d] bg-[#FF5A00]/12 border-[#FF5A00]/30", punto: "bg-[#FF5A00]" },
  COMPLETADO: { texto: "Completado", clase: "text-emerald-300 bg-emerald-500/12 border-emerald-500/30", punto: "bg-emerald-400" },
};
