/** Solo administración corrige fichadas (el servidor lo vuelve a verificar). */
export function esAdminLocal() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_conoflex") || "null");
    return String(u?.rol || "").toUpperCase() === "ADMIN";
  } catch {
    return false;
  }
}
