import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { getApiUrl } from "../apiConfig";
import { api } from "../produccion/util";
import { Aviso, Boton, Chip, Modal, Vacio } from "./ui";

const fechaHora = (v) => (v ? new Date(v).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ACCION = {
  ACTUALIZADO: { texto: "Actualizado", tono: "verde" },
  NUEVO: { texto: "Creado", tono: "naranja" },
  OMITIDO: { texto: "Sin tocar (ficha corregida a mano)", tono: "ambar" },
};

async function abrirPdf(id) {
  const res = await fetch(getApiUrl(`/api/comercial/fichas-pdf/${id}/archivo`));
  if (!res.ok) throw new Error("Ese PDF no está guardado (se importó antes de que se guardaran).");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function TarjetaPdf({ f, onAbrirProducto }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState("");
  const total = f.productos.length;
  return (
    <li className="rounded-xl border border-zinc-800 bg-[#0d0d0e] overflow-hidden">
      <div className="p-4 flex flex-wrap items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-[#FF5A00]/10 text-[#FF5A00] grid place-items-center"><FileText size={20} /></div>
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-medium text-white break-words">{f.nombre}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{fechaHora(f.created_at)}{f.usuario ? ` · ${f.usuario}` : ""} · {kb(f.bytes)}{f.categoria ? ` · ${f.categoria}` : ""}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {!f.leido && <Chip tono="rojo">No se pudo leer</Chip>}
            {f.actualizados > 0 && <Chip tono="verde">{f.actualizados} {f.actualizados === 1 ? "producto actualizado" : "productos actualizados"}</Chip>}
            {f.nuevos > 0 && <Chip tono="naranja">{f.nuevos} {f.nuevos === 1 ? "creado" : "creados"}</Chip>}
            {f.omitidos > 0 && <Chip tono="ambar">{f.omitidos} sin tocar</Chip>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Boton variante="suave" onClick={() => abrirPdf(f.id).catch((e) => setError(e.message))}><ExternalLink size={15} /> Ver PDF</Boton>
          {total > 0 && (
            <Boton variante="suave" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>Productos <ChevronDown size={15} className={`transition-transform ${abierta ? "rotate-180" : ""}`} /></Boton>
          )}
        </div>
      </div>
      {error && <div className="px-4 pb-3"><Aviso tono="rojo">{error}</Aviso></div>}
      {abierta && (
        <ul className="border-t border-zinc-800 divide-y divide-zinc-800/70 max-h-72 overflow-y-auto">
          {f.productos.map((p, i) => (
            <li key={`${p.codigo}-${i}`} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {p.producto_id && p.existe ? (
                <button onClick={() => onAbrirProducto(p.producto_id)} className="font-semibold text-[#ff8a4d] hover:underline cursor-pointer">{p.codigo}</button>
              ) : <b className="text-zinc-400">{p.codigo}</b>}
              <span className="text-zinc-500 min-w-0 flex-1 truncate">{p.nombre || (p.existe ? "" : "producto eliminado")}</span>
              <Chip tono={ACCION[p.accion]?.tono || "neutro"}>{ACCION[p.accion]?.texto || p.accion}</Chip>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FichasPdf({ onCerrar, onAbrirProducto }) {
  const [fichas, setFichas] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/comercial/fichas-pdf").then((d) => setFichas(d.fichas)).catch((e) => setError(e.message));
  }, []);
  return (
    <Modal titulo="PDFs de usos y fichas subidos" onCerrar={onCerrar} ancho="max-w-3xl">
      {error && <Aviso tono="rojo">{error}</Aviso>}
      {!fichas && !error && <div className="py-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>}
      {fichas && fichas.length === 0 && <Vacio icono={FileText} titulo="Todavía no hay PDFs guardados" texto="Los PDF que importes desde “Importar fichas PDF” van a aparecer acá, con los productos que modificó cada uno." />}
      {fichas && fichas.length > 0 && (
        <ul className="space-y-3">
          {fichas.map((f) => <TarjetaPdf key={f.id} f={f} onAbrirProducto={(id) => { onCerrar(); onAbrirProducto(id); }} />)}
        </ul>
      )}
    </Modal>
  );
}
