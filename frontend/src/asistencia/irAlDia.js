const CLAVE = "asistencia_ir_al_dia";
const VIGENCIA_MS = 30000;

/** Deja pedido que Control Asistencia abra el día de un operario (lo usa el aviso de Lía antes de cambiar de pantalla). */
export function pedirIrAlDia(operario, fecha) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ operario, fecha, t: Date.now() }));
  } catch {
    /* sin almacenamiento: abre igual, pero en el mes actual */
  }
}

/** Lee el pedido sin borrarlo (el módulo puede montarse más de una vez). null si no hay, venció o es inválido. */
export function leerIrAsistencia() {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
    const vigente = v && Date.now() - Number(v.t) < VIGENCIA_MS;
    return vigente && typeof v.operario === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.fecha) ? v : null;
  } catch {
    return null;
  }
}

/** Se llama cuando el día ya se abrió. */
export function consumirIrAlDia() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}
