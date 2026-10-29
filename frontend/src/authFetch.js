// Interceptor global de fetch: agrega el JWT a todas las requests a NUESTRA API
// (nunca a servicios de terceros) y vuelve al login si el servidor dice 401.
import { API_BASE_URL } from "./apiConfig";

const fetchOriginal = window.fetch.bind(window);

// Rutas que no requieren sesión (y cuyo 401 no significa "sesión vencida").
const RUTAS_SIN_SESION = ["/api/auth/login", "/api/public/"];

function resolverUrl(input) {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

function esApiPropia(url) {
  if (!url || !url.pathname.startsWith("/api/")) return false;
  if (url.origin === window.location.origin) return true;
  try {
    return !!API_BASE_URL && url.origin === new URL(API_BASE_URL).origin;
  } catch {
    return false;
  }
}

function cerrarSesion() {
  const habiaSesion =
    localStorage.getItem("token") || localStorage.getItem("usuario_conoflex");
  localStorage.removeItem("token");
  localStorage.removeItem("usuario_conoflex");
  if (habiaSesion) window.location.reload();
}

window.fetch = async (input, init = {}) => {
  const url = resolverUrl(input);
  if (!esApiPropia(url)) return fetchOriginal(input, init);

  const headers = new Headers(
    init.headers || (input instanceof Request ? input.headers : undefined),
  );
  const token = localStorage.getItem("token");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const respuesta = await fetchOriginal(input, { ...init, headers });

  // Solo el 401 emitido por el middleware de sesión cierra la sesión; otros 401
  // de rutas concretas (ej: Gmail no conectado) se dejan pasar sin tocar.
  const sinSesion = RUTAS_SIN_SESION.some((r) => url.pathname.startsWith(r));
  if (respuesta.status === 401 && !sinSesion) {
    const cuerpo = await respuesta
      .clone()
      .json()
      .catch(() => null);
    if (cuerpo?.codigo === "SESION_INVALIDA") cerrarSesion();
  }

  return respuesta;
};
