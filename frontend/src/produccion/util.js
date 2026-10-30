// Utilidades compartidas por Planificación OT y Carga de producción.
import { getApiUrl } from "../apiConfig";

// ---------- API ----------
// El interceptor global (authFetch) agrega el token. Los errores del servidor
// llegan como { error, problemas? }: acá se convierten en una excepción con ese texto.
export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(getApiUrl(path), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisá la red y probá de nuevo.");
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo JSON */
  }
  if (!res.ok) {
    const e = new Error(json?.error || `Error ${res.status}`);
    e.problemas = json?.problemas || null;
    e.status = res.status;
    throw e;
  }
  return json;
}

// ---------- Fechas (siempre "YYYY-MM-DD", sin zonas horarias) ----------
const pad = (n) => String(n).padStart(2, "0");
export const aISO = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseISO = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const sumarDias = (iso, n) => {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aISO(d);
};
export const lunesDe = (iso) => {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return aISO(d);
};
export const semanaISO = (iso) => {
  const d = parseISO(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const primero = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((d - primero) / 86400000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7,
    )
  );
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const nombreDia = (iso) => DIAS[parseISO(iso).getUTCDay()];
export const diaCorto = (iso) => nombreDia(iso).slice(0, 3).toUpperCase();
export const diaMes = (iso) => `${parseISO(iso).getUTCDate()} ${MESES[parseISO(iso).getUTCMonth()]}`;
export const rangoSemana = (lunes) => {
  const a = parseISO(lunes);
  const b = parseISO(sumarDias(lunes, 6));
  const mismoMes = a.getUTCMonth() === b.getUTCMonth();
  return `${a.getUTCDate()}${mismoMes ? "" : " " + MESES[a.getUTCMonth()]} – ${b.getUTCDate()} ${MESES[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
};

// ---------- Formatos ----------
export const num = (v, dec = 0) =>
  Number(v ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec,
  });

export const TURNOS = [
  { id: "DIA", label: "Día" },
  { id: "NOCHE", label: "Noche" },
];
export const turnoLabel = (t) => (t === "NOCHE" ? "Noche" : "Día");

// Turno que corresponde a esta hora (para abrir la tablet en el turno en curso).
export const turnoDeAhora = (d = new Date()) =>
  d.getHours() >= 6 && d.getHours() < 18 ? "DIA" : "NOCHE";
