import { NIVELES_PRIORIDAD } from "../compras/prioridades";
export { nf, norm, abrev } from "../materias/util";

// Misma escala 1 a 5 que las solicitudes de compra.
export const NIVELES = NIVELES_PRIORIDAD.map((n) => ({ ...n, nombre: n.label.split(" - ")[1], color: { 1: "#60a5fa", 2: "#34d399", 3: "#fbbf24", 4: "#fb923c", 5: "#fb7185" }[n.valor] }));
export const nivel = (v) => NIVELES.find((n) => n.valor === Number(v)) || NIVELES[2];

export const ESTADO = {
  PENDIENTE: { texto: "Pendiente", tono: "amarillo" },
  AGREGADA: { texto: "Agregada", tono: "verde" },
  DESCARTADA: { texto: "Descartada", tono: "gris" },
};

export const idSC = (n) => `SC-${String(n).padStart(5, "0")}`;
export const areaDe = (rol) => ({ DEPOSITO: "Depósito", PRODUCCION: "Producción", ADMIN: "Administración" })[String(rol || "").toUpperCase()] || "";
