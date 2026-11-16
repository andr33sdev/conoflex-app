// Formatos del módulo Depósito.
export const ETAPAS = [
  { v: "TODOS", t: "Todos" },
  { v: "PENDIENTE", t: "Por armar" },
  { v: "ARMADO", t: "Armados" },
  { v: "DESPACHADO", t: "Despachados" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-10" → "10 nov" (con año si no es el actual). */
export function fechaCorta(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return String(iso);
  return `${d} ${MESES[m - 1]}${a !== new Date().getFullYear() ? ` ${a}` : ""}`;
}

/** Fecha y hora de una marca de la app: "12 nov · 10:35". */
export function fechaHora(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const hoy = new Date();
  const dia = d.toDateString() === hoy.toDateString() ? "Hoy" : `${d.getDate()} ${MESES[d.getMonth()]}`;
  return `${dia} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const cant = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "";

export const rutaPedido = (p) => `/api/deposito/pedidos/${encodeURIComponent(p.op)}/${p.fecha}`;
