import { CheckCircle2, PackageCheck, PackageOpen } from "lucide-react";

/** Acción principal según el estado y lo que puede hacer el rol. null si no le toca a esta persona. */
export function accionPrincipal(s, { isProduccion, isDeposito }) {
  if (s.estado === "SOLICITADO" && isProduccion) return { id: "ATENDER", texto: "Atender", icono: CheckCircle2, estilo: "naranja" };
  if (s.estado === "ATENDIDO" && isProduccion) return { id: "DISPONIBLE", texto: "Marcar disponible", icono: PackageCheck, estilo: "amarillo" };
  if (s.estado === "DISPONIBLE" && isDeposito) return { id: "RETIRAR", texto: "Retirar", icono: PackageOpen, estilo: "amarillo" };
  return null;
}
export const ESPERA = { SOLICITADO: "Esperando a producción", ATENDIDO: "Producción lo está preparando", DISPONIBLE: "Listo para retirar en depósito" };

export const BOTON = {
  naranja: "bg-[#FF5A00] text-black hover:bg-[#ff7a30]",
  amarillo: "bg-[#FFD60A] text-black hover:bg-white",
};

