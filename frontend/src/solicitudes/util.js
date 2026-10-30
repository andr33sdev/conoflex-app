// Formatos y reglas compartidas del módulo Solicitudes internas.
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
export const getApiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

export const getNowLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const aFecha = (raw) => {
  if (!raw || raw === "--") return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  const d2 = new Date(String(raw).replace(" ", "T"));
  return isNaN(d2.getTime()) ? null : d2;
};

export const formatFechaArg = (raw) => {
  const d = aFecha(raw);
  if (!d) {
    const parts = String(raw || "").split(" ")[0].split("T")[0].split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "--";
  }
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

export const formatHoraArg = (raw) => {
  const d = aFecha(raw);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

/** "hace 5 min", "hace 3 h", "hace 2 d". */
export const hace = (raw, ahora = Date.now()) => {
  const d = aFecha(raw);
  if (!d) return "";
  const min = Math.max(0, Math.round((ahora - d.getTime()) / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
};

export const horasDesde = (raw, ahora = Date.now()) => {
  const d = aFecha(raw);
  return d ? (ahora - d.getTime()) / 3600000 : null;
};

export const solId = (s) => {
  const raw = String(s?.id ?? "");
  return raw.startsWith("SOL-") ? raw : `SOL-${raw}`;
};
export const motivoDe = (s) => s?.motivoUso || s?.motivo_uso || s?.motivo || "";
export const archivada = (s) => s.estado === "ENTREGADO" || s.estado === "CANCELADO";

export const PASOS = ["SOLICITADO", "ATENDIDO", "DISPONIBLE", "ENTREGADO"];
export const ESTADO = {
  SOLICITADO: { texto: "Solicitado", clase: "text-zinc-200 bg-white/[0.07] border-white/[0.12]", punto: "bg-zinc-300" },
  ATENDIDO: { texto: "Atendido", clase: "text-[#ff8a4d] bg-[#FF5A00]/12 border-[#FF5A00]/30", punto: "bg-[#FF5A00]" },
  DISPONIBLE: { texto: "Disponible", clase: "text-[#FFD60A] bg-[#FFD60A]/12 border-[#FFD60A]/30", punto: "bg-[#FFD60A]" },
  ENTREGADO: { texto: "Entregado", clase: "text-emerald-300 bg-emerald-500/12 border-emerald-500/30", punto: "bg-emerald-400" },
  CANCELADO: { texto: "Cancelado", clase: "text-rose-300 bg-rose-500/12 border-rose-500/30", punto: "bg-rose-400" },
};
export const URGENCIA = {
  ALTA: { texto: "Alta", clase: "text-rose-300 bg-rose-500/12 border-rose-500/30", borde: "bg-rose-400", activa: "border-rose-400 bg-rose-500/15 text-rose-200" },
  MEDIA: { texto: "Media", clase: "text-[#FFD60A] bg-[#FFD60A]/10 border-[#FFD60A]/25", borde: "bg-[#FFD60A]", activa: "border-[#FFD60A] bg-[#FFD60A]/12 text-[#FFD60A]" },
  BAJA: { texto: "Baja", clase: "text-zinc-400 bg-white/[0.05] border-white/[0.1]", borde: "bg-zinc-600", activa: "border-zinc-300 bg-white/[0.08] text-white" },
};
