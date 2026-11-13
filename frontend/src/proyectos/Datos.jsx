// Datos del proyecto y quiénes esperan novedades (les llegan los avisos de pruebas y cambios de estado).
import { useState } from "react";
import { Check } from "lucide-react";
import { api } from "../produccion/util";
import { TIPOS, botonPrimario, campo, etiqueta } from "./formato";

const PRIORIDADES = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };

export default function Datos({ p, accion, usuarios }) {
  const inicial = { titulo: p.titulo, tipo: p.tipo, proveedor: p.proveedor || "", descripcion: p.descripcion || "", prioridad: p.prioridad, responsable_id: p.responsable_id || "", fecha_objetivo: p.fecha_objetivo || "" };
  const [f, setF] = useState(inicial);
  const [ints, setInts] = useState(p.interesados.map((i) => i.usuario_id));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cambiado = JSON.stringify(f) !== JSON.stringify(inicial);
  const cambioInts = JSON.stringify([...ints].sort()) !== JSON.stringify(p.interesados.map((i) => i.usuario_id).sort());

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4" aria-label="Datos">
        <h2 className="text-sm font-semibold text-white">Datos</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={`${etiqueta} sm:col-span-2`}>Título<input value={f.titulo} onChange={set("titulo")} maxLength={200} className={campo} /></label>
          <label className={etiqueta}>Qué es<select value={f.tipo} onChange={set("tipo")} className={campo}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.texto}</option>)}</select></label>
          <label className={etiqueta}>Prioridad<select value={f.prioridad} onChange={set("prioridad")} className={campo}>{Object.entries(PRIORIDADES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className={etiqueta}>Proveedor<input value={f.proveedor} onChange={set("proveedor")} maxLength={200} className={campo} /></label>
          <label className={etiqueta}>Responsable<select value={f.responsable_id} onChange={set("responsable_id")} className={campo}><option value="">—</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
          <label className={etiqueta}>Fecha objetivo<input type="date" value={f.fecha_objetivo} onChange={set("fecha_objetivo")} className={campo} /></label>
          <label className={`${etiqueta} sm:col-span-2`}>De qué se trata<textarea value={f.descripcion} onChange={set("descripcion")} rows={4} className={`${campo} resize-y`} /></label>
        </div>
        {cambiado && <button onClick={() => accion(() => api(`/api/proyectos/${p.id}`, { method: "PUT", body: { ...f, responsable_id: f.responsable_id ? Number(f.responsable_id) : null } }), "Datos guardados.")} className={`${botonPrimario} mt-4`}><Check size={16} /> Guardar cambios</button>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4 h-fit" aria-label="Interesados">
        <h2 className="text-sm font-semibold text-white">¿Quiénes esperan novedades?</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Les llega a la campanita (y al celular) cuando se aprueba o rechaza una prueba, cuando cambia el estado y cuando se avisa una novedad.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {usuarios.map((u) => {
            const on = ints.includes(u.id);
            return (
              <button key={u.id} aria-pressed={on} onClick={() => setInts((x) => (on ? x.filter((i) => i !== u.id) : [...x, u.id]))} className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer ${on ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white" : "border-zinc-800 text-zinc-400 hover:text-white"}`}>{u.nombre}</button>
            );
          })}
        </div>
        {cambioInts && <button onClick={() => accion(() => api(`/api/proyectos/${p.id}/interesados`, { method: "PUT", body: { usuarios: ints } }), "Interesados guardados.")} className={`${botonPrimario} mt-4`}><Check size={16} /> Guardar</button>}
      </section>
    </div>
  );
}
