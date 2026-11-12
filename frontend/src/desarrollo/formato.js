// Constantes y formatos del módulo Desarrollo de productos.
import { getApiUrl } from "../apiConfig";

export const NARANJA = "#FF5A00";

export const ESTADOS = {
  EN_CURSO: { texto: "En curso", clase: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  PAUSADO: { texto: "Pausado", clase: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30" },
  TERMINADO: { texto: "Lanzado", clase: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  DESCARTADO: { texto: "Descartado", clase: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
};
export const ORIGENES = { DIRECCION: "Dirección", CLIENTE: "Cliente", MERCADO: "Mercado", INTERNO: "Interno" };
export const TIPOS_ARCHIVO = { FOTO: "Foto", RENDER: "Render", PLANO: "Plano", DOCUMENTO: "Documento", OTRO: "Otro" };

export const fechaCorta = (f) => {
  if (!f) return "—";
  const d = new Date(String(f).length <= 10 ? `${String(f).slice(0, 10)}T12:00:00` : f);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
};
export const fechaHora = (f) => {
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
export const hace = (f) => {
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return dias < 30 ? `hace ${dias} día${dias === 1 ? "" : "s"}` : fechaCorta(f);
};
export const pesoArchivo = (n) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const plata = (n) => (n == null ? "—" : `$ ${Math.round(Number(n)).toLocaleString("es-AR")}`);
export const usd = (n) => (n == null ? "—" : `US$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Abre un archivo privado del proyecto (pasa por la sesión) en otra pestaña o lo descarga. */
export async function abrirArchivo(a, descargar = false) {
  const r = await fetch(getApiUrl(`/api/desarrollo/archivos/${a.id}${descargar ? "?descargar=1" : ""}`));
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


export const campo = "w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 [color-scheme:dark]";
export const etiqueta = "flex flex-col gap-1.5 text-xs font-semibold text-zinc-400";
export const botonPrimario = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#FF5A00] hover:bg-[#ff7a2e] text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
export const botonSecundario = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-zinc-800 hover:border-zinc-600 text-zinc-200 cursor-pointer disabled:opacity-50 transition-colors";

