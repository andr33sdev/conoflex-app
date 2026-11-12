// Alta de un desarrollo: lo mínimo para arrancar. Todo lo demás se completa en el proyecto.
import { useState } from "react";
import { Loader2, Sparkles, Wrench } from "lucide-react";
import { api } from "../produccion/util";
import { Modal } from "./util";
import { ORIGENES, botonPrimario, campo, etiqueta } from "./formato";

export default function Nuevo({ onCerrar, onCreado, aviso }) {
  const [f, setF] = useState({ tipo: "NUEVO", nombre: "", descripcion: "", origen: "DIRECCION", cliente: "", punto_partida: "", fecha_objetivo: "" });
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const mod = f.tipo === "MODIFICACION";

  const crear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const r = await api("/api/desarrollo/proyectos", { method: "POST", body: f });
      onCreado(r.id);
    } catch (err) {
      aviso(err.message, "error");
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Nuevo desarrollo" subtitulo="Arrancá con lo básico. Fotos, etapas y pruebas se cargan adentro." onCerrar={onCerrar}>
      <form onSubmit={crear} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
          {[
            { id: "NUEVO", t: "Producto nuevo", d: "Circuito completo del R.032", i: Sparkles },
            { id: "MODIFICACION", t: "Modificación", d: "Cambio menor en uno existente", i: Wrench },
          ].map(({ id, t, d, i: I }) => (
            <button key={id} type="button" role="radio" aria-checked={f.tipo === id} onClick={() => setF((x) => ({ ...x, tipo: id }))} className={`text-left rounded-xl border p-3 cursor-pointer ${f.tipo === id ? "border-[#FF5A00] bg-[#FF5A00]/10" : "border-zinc-800 hover:border-zinc-600"}`}>
              <I size={18} className={f.tipo === id ? "text-[#FF5A00]" : "text-zinc-500"} />
              <span className="block mt-2 text-sm font-semibold text-white">{t}</span>
              <span className="block text-xs text-zinc-500">{d}</span>
            </button>
          ))}
        </div>
        <label className={etiqueta}>
          {mod ? "Qué producto y qué cambio" : "Nombre del producto"}
          <input autoFocus value={f.nombre} onChange={set("nombre")} required maxLength={200} placeholder={mod ? "Ej: 2300L — cinta reflectiva en lugar de ojo de gato" : "Ej: Cono Vial 1176 PVC-PE"} className={campo} />
        </label>
        <label className={etiqueta}>
          {mod ? "Por qué se cambia" : "Qué se busca"}
          <textarea value={f.descripcion} onChange={set("descripcion")} rows={3} placeholder={mod ? "Motivo del cambio" : "Ej: alternativa económica con base negra de material reciclado para el segmento masivo"} className={`${campo} resize-y`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={etiqueta}>
            Lo pide
            <select value={f.origen} onChange={set("origen")} className={campo}>
              {Object.entries(ORIGENES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className={etiqueta}>
            Fecha objetivo
            <input type="date" value={f.fecha_objetivo} onChange={set("fecha_objetivo")} className={campo} />
          </label>
        </div>
        {f.origen === "CLIENTE" && (
          <label className={etiqueta}>
            Cliente
            <input value={f.cliente} onChange={set("cliente")} maxLength={200} className={campo} />
          </label>
        )}
        {!mod && (
          <label className={etiqueta}>
            De qué se parte <span className="font-normal text-zinc-600">(opcional)</span>
            <input value={f.punto_partida} onChange={set("punto_partida")} maxLength={500} placeholder="Producto similar nuestro, muestra de un cliente, producto del mercado…" className={campo} />
          </label>
        )}
        <button type="submit" disabled={guardando || !f.nombre.trim()} className={`${botonPrimario} mt-1`}>
          {guardando && <Loader2 size={16} className="animate-spin" />} Crear desarrollo
        </button>
      </form>
    </Modal>
  );
}
