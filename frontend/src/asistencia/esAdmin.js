/** Solo administración corrige fichadas (el servidor lo vuelve a verificar). */
export function esAdminLocal() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_conoflex") || "null");
    return String(u?.rol || "").toUpperCase() === "ADMIN";
  } catch {
    return false;
  }
}

/** El legajo lo ven solo los roles ADMIN y PRODUCCION (el servidor lo vuelve a verificar). */
export function puedeVerLegajo() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_conoflex") || "null");
    const rol = String(u?.rol || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return rol === "ADMIN" || rol === "PRODUCCION";
  } catch {
    return false;
  }
}
