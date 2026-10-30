// Formatos y cuentas de fórmula compartidos por la pantalla de Ingenierías y la campanita.
export const aNum = (t) => {
  if (t === "" || t == null) return NaN;
  return typeof t === "number" ? t : Number(String(t).replace(",", "."));
};

export const nf = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: d }) : "—");

/** kg con la unidad que más se lee: bajo 1 kg, en gramos. */
export const kgLindo = (kg) => {
  if (!Number.isFinite(kg)) return "—";
  if (kg > 0 && kg < 1) return `${nf(kg * 1000, 1)} g`;
  return `${nf(kg, 3)} kg`;
};

export const fechaHora = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const fechaCorta = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

export const hace = (v) => {
  if (!v) return "";
  const seg = (Date.now() - new Date(v).getTime()) / 1000;
  if (!Number.isFinite(seg)) return "";
  if (seg < 90) return "recién";
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  if (seg < 86400 * 30) return `hace ${Math.round(seg / 86400)} d`;
  return fechaCorta(v);
};

export const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Porcentajes sobre el total de la tachada: [{...l, pct}]. */
export const conPct = (lineas) => {
  const total = lineas.reduce((a, l) => a + (Number(l.kg_tachada) || 0), 0);
  return lineas.map((l) => ({ ...l, pct: total > 0 ? ((Number(l.kg_tachada) || 0) / total) * 100 : 0 }));
};

// Colores para distinguir materiales dentro de una misma fórmula (barra apilada).
export const COLORES = ["#FF5A00", "#FFD60A", "#38bdf8", "#34d399", "#a78bfa", "#fb7185", "#f59e0b", "#94a3b8"];
