// Pruebas de verificación (¿cumple con lo pedido?) y validación (¿sirve para el uso previsto?).
import { useState } from "react";
import { CheckCircle2, Circle, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { api } from "../produccion/util";
import { Modal } from "./util";
import { botonPrimario, botonSecundario, campo, etiqueta, fechaCorta } from "./formato";

const GRUPOS = [
  { id: "VERIFICACION", titulo: "Verificación", ayuda: "Lo que salió, ¿cumple con las entradas del desarrollo? Cotas, pesos, espesores, ensambles." },
  { id: "VALIDACION", titulo: "Validación", ayuda: "¿Sirve para el uso previsto? Impactos, intemperie, adherencia, prueba con el cliente." },
];
const vacia = (tipo) => ({ tipo, que: "", objetivo: "", resultado: "", metodo: "", cumple: "PENDIENTE", accion: "", fecha: new Date().toISOString().slice(0, 10) });

function Formulario({ inicial, onGuardar, onCerrar }) {
  const [f, setF] = useState(inicial);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal titulo={inicial.id ? "Editar prueba" : "Nueva prueba"} onCerrar={onCerrar}>
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(f); }} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de prueba">
          {GRUPOS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={f.tipo === g.id} onClick={() => setF((x) => ({ ...x, tipo: g.id }))} className={`rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer ${f.tipo === g.id ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white" : "border-zinc-800 text-zinc-400"}`}>{g.titulo}</button>
          ))}
        </div>
        <label className={etiqueta}>Qué se prueba<input autoFocus required value={f.que} onChange={set("que")} placeholder="Ej: Espesor de pared" className={campo} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={etiqueta}>Objetivo<input value={f.objetivo || ""} onChange={set("objetivo")} placeholder="Ej: 3 mm ± 0,2" className={campo} /></label>
          <label className={etiqueta}>Resultado<input value={f.resultado || ""} onChange={set("resultado")} placeholder="Ej: 3,1 mm" className={campo} /></label>
        </div>
        <label className={etiqueta}>Método<input value={f.metodo || ""} onChange={set("metodo")} placeholder="Ej: calibre en 4 puntos, 5 muestras" className={campo} /></label>
        <div>
          <p className="text-xs font-semibold text-zinc-400 mb-1.5">¿Cumple?</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cumple">
            {[["SI", "Cumple", "border-emerald-500 bg-emerald-500/10 text-emerald-300"], ["NO", "No cumple", "border-rose-500 bg-rose-500/10 text-rose-300"], ["PENDIENTE", "Pendiente", "border-zinc-500 bg-zinc-800 text-white"]].map(([k, t, c]) => (
              <button key={k} type="button" role="radio" aria-checked={f.cumple === k} onClick={() => setF((x) => ({ ...x, cumple: k }))} className={`rounded-xl border px-3 py-2 text-sm font-semibold cursor-pointer ${f.cumple === k ? c : "border-zinc-800 text-zinc-400"}`}>{t}</button>
            ))}
          </div>
        </div>
        {f.cumple === "NO" && <label className={etiqueta}>Qué se hace<input value={f.accion || ""} onChange={set("accion")} placeholder="Ej: se corrige la matriz y se vuelve a medir" className={campo} /></label>}
        <label className={etiqueta}>Fecha<input type="date" value={f.fecha || ""} onChange={set("fecha")} className={campo} /></label>
        <button type="submit" disabled={!f.que.trim()} className={`${botonPrimario} mt-1`}>Guardar</button>
      </form>
    </Modal>
  );
}

export default function Pruebas({ p, accion }) {
  const [form, setForm] = useState(null);
  const guardar = async (f) => {
    const ok = await accion(() => (f.id ? api(`/api/desarrollo/pruebas/${f.id}`, { method: "PUT", body: f }) : api(`/api/desarrollo/proyectos/${p.id}/pruebas`, { method: "POST", body: f })), "Prueba guardada.");
    if (ok) setForm(null);
  };
  const cumple = (x, valor) => accion(() => api(`/api/desarrollo/pruebas/${x.id}`, { method: "PUT", body: { cumple: valor } }));
  const borrar = (x) => window.confirm(`¿Borrar la prueba «${x.que}»?`) && accion(() => api(`/api/desarrollo/pruebas/${x.id}`, { method: "DELETE" }), "Prueba borrada.");

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {GRUPOS.map((g) => {
        const lista = p.pruebas.filter((x) => x.tipo === g.id);
        const ok = lista.filter((x) => x.cumple === "SI").length;
        return (
          <section key={g.id} aria-label={g.titulo}>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <h2 className="text-lg font-semibold text-white">{g.titulo} {lista.length > 0 && <span className="text-sm font-normal text-zinc-500">· {ok} de {lista.length} cumplen</span>}</h2>
                <p className="text-xs text-zinc-500">{g.ayuda}</p>
              </div>
              <button onClick={() => setForm(vacia(g.id))} className={botonSecundario}><Plus size={16} /> Agregar</button>
            </div>
            {lista.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-600">Sin pruebas cargadas. También podés contarlas en la Bitácora y el asistente las arma.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {lista.map((x) => (
                  <li key={x.id} className={`rounded-xl border bg-[#0b0b0c] p-3 flex items-start gap-3 ${x.cumple === "NO" ? "border-rose-500/30" : "border-zinc-800"}`}>
                    <div className="flex flex-col gap-1 shrink-0" role="radiogroup" aria-label={`Resultado de ${x.que}`}>
                      <button onClick={() => cumple(x, "SI")} role="radio" aria-checked={x.cumple === "SI"} title="Cumple" className="cursor-pointer">{x.cumple === "SI" ? <CheckCircle2 size={22} className="text-emerald-400" /> : <Circle size={22} className="text-zinc-700 hover:text-emerald-400" />}</button>
                      <button onClick={() => cumple(x, "NO")} role="radio" aria-checked={x.cumple === "NO"} title="No cumple" className="cursor-pointer">{x.cumple === "NO" ? <XCircle size={22} className="text-rose-400" /> : <Circle size={22} className="text-zinc-700 hover:text-rose-400" />}</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{x.que}</p>
                      <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
                        {x.objetivo && <><dt className="text-zinc-500">Objetivo</dt><dd className="text-zinc-200">{x.objetivo}</dd></>}
                        {x.resultado && <><dt className="text-zinc-500">Resultado</dt><dd className="text-zinc-200">{x.resultado}</dd></>}
                        {x.metodo && <><dt className="text-zinc-500">Método</dt><dd className="text-zinc-300">{x.metodo}</dd></>}
                        {x.cumple === "NO" && <><dt className="text-rose-300">Qué se hace</dt><dd className={x.accion ? "text-zinc-200" : "text-rose-300"}>{x.accion || "Falta indicar"}</dd></>}
                      </dl>
                      <p className="mt-1 text-[11px] text-zinc-600">{fechaCorta(x.fecha)} · {x.usuario_nombre}</p>
                    </div>
                    <button onClick={() => setForm({ ...x, fecha: x.fecha ? String(x.fecha).slice(0, 10) : "" })} aria-label="Editar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><Pencil size={14} /></button>
                    <button onClick={() => borrar(x)} aria-label="Borrar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-zinc-900 cursor-pointer"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {form && <Formulario inicial={form} onGuardar={guardar} onCerrar={() => setForm(null)} />}
    </div>
  );
}
