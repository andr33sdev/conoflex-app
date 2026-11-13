// Llamadas que no son JSON: subir archivos y abrirlos (pasan por la sesión del usuario).
import { getApiUrl } from "../apiConfig";

export async function subirArchivos(proyectoId, files, { pruebaId } = {}) {
  const fd = new FormData();
  if (pruebaId) fd.append("prueba_id", String(pruebaId));
  for (const f of files) fd.append("archivos", f);
  const r = await fetch(getApiUrl(`/api/proyectos/${proyectoId}/archivos`), { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudieron subir los archivos.");
  return j;
}

export async function abrirArchivo(a, descargar = false) {
  const r = await fetch(getApiUrl(`/api/proyectos/archivos/${a.id}${descargar ? "?descargar=1" : ""}`));
  if (!r.ok) throw new Error("No se pudo abrir el archivo.");
  const url = URL.createObjectURL(await r.blob());
  if (descargar) {
    const el = document.createElement("a");
    el.href = url;
    el.download = a.nombre;
    el.click();
  } else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Imagen privada como data URL (para el informe imprimible). */
export async function imagenComoDataUrl(id, completa = false) {
  const r = await fetch(getApiUrl(`/api/proyectos/archivos/${id}${completa ? "" : "/miniatura"}`));
  if (!r.ok) return null;
  const b = await r.blob();
  return new Promise((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.readAsDataURL(b);
  });
}
