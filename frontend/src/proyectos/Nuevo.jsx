// Alta: qué es, de qué se trata y, si alguien espera el resultado (ej. Compras), quién.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { TIPOS, botonPrimario, campo, etiqueta } from "./formato";
import { Modal } from "./util";

const EJEMPLOS = {
  PRUEBA: "Ej: Pintura nueva de Pinturerías Sur",
  MAQUINA: "Ej: Embaladora automática",
  OBJETIVO: "Ej: Bajar las fallas de inyección al 2%",
  MEJORA: "Ej: Reordenar el depósito de semielaborados",
  IDEA: "Ej: Conos con QR para trazabilidad",
  OTRO: "Título",
};

export default function Nuevo({ onCerrar, onCreado, aviso }) {
  const [f, setF] = useState({ tipo: "PRUEBA", titulo: "", descripcion: "", proveedor: "", proximo_paso: "", proximo_paso_fecha: "", interesados: [] });
  const [usuarios, setUsuarios] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    api("/api/proyectos/usuarios").then(setUsuarios).catch(() => {});
  }, []);
  const conProveedor = f.tipo === "PRUEBA" || f.tipo === "MAQUINA";

  const crear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const r = await api("/api/proyectos", { method: "POST", body: f });
      onCreado(r.id);
    } catch (err) {
      aviso(err.message, "error");
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Nuevo" subtitulo="Lo básico para arrancar. Fotos, pruebas y novedades se cargan adentro." onCerrar={onCerrar}>
      <form onSubmit={crear} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Qué es">
          {Object.entries(TIPOS).map(([k, t]) => {
            const I = t.icono;
            return (
              <button key={k} type="button" role="radio" aria-checked={f.tipo === k} onClick={() => setF((x) => ({ ...x, tipo: k }))} title={t.ayuda} className={`rounded-xl border px-2 py-2.5 flex flex-col items-center gap-1 text-xs font-semibold cursor-pointer ${f.tipo === k ? `border-[#FF5A00] ${t.fondo} text-white` : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>
                <I size={18} className={t.color} /> {t.texto}
              </button>
            );
          })}
        </div>
        <p className="-mt-2 text-xs text-zinc-500">{TIPOS[f.tipo].ayuda}.</p>
        <label className={etiqueta}>Título<input autoFocus required maxLength={200} value={f.titulo} onChange={set("titulo")} placeholder={EJEMPLOS[f.tipo]} className={campo} /></label>
        {conProveedor && <label className={etiqueta}>Proveedor <span className="font-normal text-zinc-600">(opcional)</span><input value={f.proveedor} onChange={set("proveedor")} maxLength={200} className={campo} /></label>}
        <label className={etiqueta}>De qué se trata <span className="font-normal text-zinc-600">(opcional)</span><textarea value={f.descripcion} onChange={set("descripcion")} rows={2} className={`${campo} resize-y`} /></label>
        <div className="grid sm:grid-cols-[1fr_150px] gap-3">
          <label className={etiqueta}>Próximo paso <span className="font-normal text-zinc-600">(opcional)</span><input value={f.proximo_paso} onChange={set("proximo_paso")} maxLength={300} placeholder="Ej: pintar 20 conos de prueba" className={campo} /></label>
          <label className={etiqueta}>Para cuándo<input type="date" value={f.proximo_paso_fecha} onChange={set("proximo_paso_fecha")} className={campo} /></label>
        </div>
        {usuarios.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold text-zinc-400 mb-1.5">¿Alguien espera el resultado? <span className="font-normal text-zinc-600">Le llegan los avisos</span></legend>
            <div className="flex flex-wrap gap-1.5">
              {usuarios.map((u) => {
                const on = f.interesados.includes(u.id);
                return (
                  <button key={u.id} type="button" aria-pressed={on} onClick={() => setF((x) => ({ ...x, interesados: on ? x.interesados.filter((i) => i !== u.id) : [...x.interesados, u.id] }))} className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer ${on ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white" : "border-zinc-800 text-zinc-400 hover:text-white"}`}>{u.nombre}</button>
                );
              })}
            </div>
          </fieldset>
        )}
        <button type="submit" disabled={guardando || !f.titulo.trim()} className={`${botonPrimario} mt-1`}>{guardando && <Loader2 size={16} className="animate-spin" />} Crear</button>
      </form>
    </Modal>
  );
}
