export const formatFecha = (isoString) => {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export const nroSC = (id) => `SC-${String(id).padStart(5, "0")}`;
export const norm = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();
export const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const nf = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: d }) : "—");

/** Materia prima a la que sumaría stock un renglón: la elegida o la que se llama (o tiene el código) exactamente igual. */
export function materiaDelItem(item, materias) {
  if (item.materia_prima_id) return materias.find((m) => m.id === Number(item.materia_prima_id)) || null;
  const t = norm(item.articulo);
  if (!t) return null;
  const r = materias.filter((m) => norm(m.nombre) === t || norm(m.codigo) === t);
  return r.length === 1 ? r[0] : null;
}

/** Resumen de avance de una solicitud. */
export function avance(sc) {
  const pedido = sc.items.reduce((a, i) => a + num(i.cantidad_solicitada), 0);
  const recibido = sc.items.reduce((a, i) => a + num(i.cantidad_recibida), 0);
  const pct = pedido > 0 ? Math.min(100, Math.round((recibido / pedido) * 100)) : 0;
  const completos = sc.items.filter((i) => num(i.cantidad_recibida) >= num(i.cantidad_solicitada)).length;
  const maxPrioridad = Math.max(...sc.items.map((i) => i.prioridad), 1);
  return { pedido, recibido, pct, completos, maxPrioridad };
}

/** "KILOS" → "kg" (y el resto en minúscula). */
export const unidadCorta = (m) => {
  const u = String(m?.unidad_medida || "kg").trim().toLowerCase();
  return u === "kilos" || u === "kilo" || u === "kgs" ? "kg" : u;
};

export const cerradaSC = (sc) => sc.estado === "COMPLETADA" || sc.estado === "CANCELADA";
export const faltaFirma = (sc) => !sc.firma_jefe || !sc.firma_gerente;

/** Datos para mostrar una solicitud sin listar todos sus artículos. */
export function resumenSC(sc) {
  const av = avance(sc);
  const proveedores = [...new Set(sc.items.map((i) => String(i.proveedor || "").trim()).filter(Boolean))];
  const porUrgencia = [...sc.items].sort((a, b) => b.prioridad - a.prioridad || a.id - b.id);
  return { ...av, proveedores, porUrgencia, masUrgente: porUrgencia[0] || null, urgente: !cerradaSC(sc) && av.maxPrioridad >= 4 };
}

/** "Mundileno S.A. +2" */
export const textoProveedores = (lista) => (lista.length === 0 ? "Sin proveedor" : lista.length === 1 ? lista[0] : `${lista[0]} +${lista.length - 1}`);
