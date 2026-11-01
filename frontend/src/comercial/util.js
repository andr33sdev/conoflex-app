import { getApiUrl } from "../apiConfig";

export const peso = (n) => `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Las fotos se guardan con la dirección completa del servidor; se pide siempre por la ruta pública. */
export function urlImagen(url) {
  if (!url) return "";
  if (/^(data:|blob:|https?:\/\/)/.test(url)) {
    const i = url.indexOf("/imagenes/");
    // Si la foto quedó guardada con otro servidor (localhost) o con la dirección http del servidor (el navegador bloquea
    // contenido http dentro de una página https), se la pide por la ruta pública del sitio actual.
    return i > 0 && (/localhost|127\.0\.0\.1/.test(url) || /^http:\/\//.test(url)) ? encodeURI(getApiUrl(url.slice(i))) : url;
  }
  return encodeURI(getApiUrl(url.includes("/imagenes/") ? "/imagenes/" + url.split("/imagenes/")[1] : url));
}

/** Envío de archivos (el interceptor global agrega el token). */
export async function subirForm(path, fd, method = "POST") {
  let res;
  try {
    res = await fetch(getApiUrl(path), { method, body: fd });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisá la red y probá de nuevo.");
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo */
  }
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json;
}

export const campo = "w-full bg-[#0b0b0c] border border-zinc-800 focus:border-[#FF5A00] focus:ring-1 focus:ring-[#FF5A00]/40 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 transition-colors";
export const etiqueta = "block text-xs font-medium text-zinc-400 mb-1.5";
