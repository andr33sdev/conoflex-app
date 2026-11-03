export const SEGMENTOS = { licitaciones: "Licitaciones", obras: "Obras", empresas: "Empresas" };

export const PRIORIDAD = {
  1: { t: "Ir ya", barra: "bg-[#FF5A00]", chip: "bg-[#FF5A00]/15 text-[#ff8a4d] border-[#FF5A00]/40" },
  2: { t: "Interesante", barra: "bg-[#FFD60A]", chip: "bg-[#FFD60A]/10 text-[#FFD60A] border-[#FFD60A]/30" },
  3: { t: "A futuro", barra: "bg-zinc-600", chip: "bg-white/[0.05] text-zinc-400 border-white/[0.1]" },
};

export const cuando = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const hoyLocal = () => {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Días que faltan para una fecha AAAA-MM-DD (negativo si ya pasó); null si no hay fecha exacta. */
export function diasHasta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - hoyLocal()) / 86400000);
}

/** Texto y color del "reloj" de una oportunidad según su fecha. */
export function reloj(o) {
  const d = diasHasta(o.fecha_iso);
  if (d === null) return o.fecha ? { t: o.fecha, clase: "text-zinc-300 border-white/[0.1] bg-white/[0.04]" } : null;
  const verbo = o.fecha_tipo === "cierre" ? "Cierra" : o.fecha_tipo === "inicio" ? "Empieza" : "Fecha";
  const t = d < 0 ? `Pasó hace ${-d} ${-d === 1 ? "día" : "días"}` : d === 0 ? `${verbo} hoy` : d === 1 ? `${verbo} mañana` : `${verbo} en ${d} días`;
  const clase = d < 0 ? "text-zinc-500 border-white/[0.08] bg-white/[0.03]" : d <= 3 ? "text-rose-300 border-rose-500/40 bg-rose-500/12" : d <= 10 ? "text-[#ff8a4d] border-[#FF5A00]/40 bg-[#FF5A00]/12" : "text-[#FFD60A] border-[#FFD60A]/30 bg-[#FFD60A]/10";
  return { t, clase, dias: d };
}

export const dominio = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url || "");
  }
};
