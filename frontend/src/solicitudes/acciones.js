import { CheckCircle2, PackageCheck, PackageOpen, PenLine, Send } from "lucide-react";

const es37 = (s) => String(s?.deposito) === "37";

/** Acción principal según el estado y lo que puede hacer el rol. null si no le toca a esta persona. */
export function accionPrincipal(s, { isProduccion, isDeposito, isAdmin }) {
  // Producto caliente esperando autorización: el admin manda el link; el que solicitó solo ve "pendiente".
  if (s.estado === "PENDIENTE_AUTORIZACION") {
    return isAdmin ? { id: "AUTORIZAR_ENVIAR", texto: "Enviar autorización", icono: Send, estilo: "violeta" } : null;
  }
  if (s.estado === "SOLICITADO" && isProduccion) {
    // En el circuito del 37 el encargado marca disponible directo, con su firma (sin paso "atendido").
    if (es37(s)) return { id: "DISPONIBLE_FIRMA", texto: "Marcar disponible", icono: PenLine, estilo: "amarillo" };
    return { id: "ATENDER", texto: "Atender", icono: CheckCircle2, estilo: "naranja" };
  }
  if (s.estado === "ATENDIDO" && isProduccion) return { id: "DISPONIBLE", texto: "Marcar disponible", icono: PackageCheck, estilo: "amarillo" };
  if (s.estado === "DISPONIBLE" && isDeposito) return { id: "RETIRAR", texto: "Retirar", icono: PackageOpen, estilo: "amarillo" };
  return null;
}
export const ESPERA = {
  PENDIENTE_AUTORIZACION: "Pendiente de autorización superior",
  SOLICITADO: "Esperando a producción",
  ATENDIDO: "Producción lo está preparando",
  DISPONIBLE: "Listo para retirar en depósito",
};

export const BOTON = {
  naranja: "bg-[#FF5A00] text-black hover:bg-[#ff7a30]",
  amarillo: "bg-[#FFD60A] text-black hover:bg-white",
  violeta: "bg-violet-500 text-white hover:bg-violet-400",
};

