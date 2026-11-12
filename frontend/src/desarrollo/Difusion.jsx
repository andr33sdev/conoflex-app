// Difusión: avisar a los líderes de área y que cada uno confirme que está enterado (y qué hizo).
// Reemplaza el grupo de WhatsApp "Novedades producción": queda registrado quién lo vio y cuándo.
import { useState } from "react";
import { Check, Clock, Megaphone, Send } from "lucide-react";
import { api } from "../produccion/util";
import { botonPrimario, campo, fechaHora } from "./formato";

export default function Difusion({ p, accion, usuarios }) {
  const plantilla = p.tipo === "MODIFICACION"
    ? `Cambio aprobado en ${p.nombre}. Cada líder: avisar a proveedores si corresponde y actualizar la ficha de producción.`
    : `Se lanza ${p.nombre}. Cada área: tener en cuenta el nuevo producto (lista de precios, compras, producción, depósito).`;
  const [sel, setSel] = useState([]);
  const [mensaje, setMensaje] = useState(plantilla);
  const alternar = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const enviar = async () => {
    if (await accion(() => api(`/api/desarrollo/proyectos/${p.id}/difusion`, { method: "POST", body: { usuarios: sel, mensaje } }), "Aviso enviado. Cada uno lo ve en la campanita y tiene que confirmar.")) setSel([]);
  };
  const confirmados = p.avisos.filter((a) => a.enterado_at).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="Avisados" className="min-w-0">
        <h2 className="text-lg font-semibold text-white">Quiénes están enterados</h2>
        <p className="text-xs text-zinc-500">Reemplaza al grupo de WhatsApp: queda registrado quién confirmó, cuándo y qué hizo.</p>
        {p.avisos.length === 0 ? (
          <div className="mt-6 text-center py-10 rounded-2xl border border-dashed border-zinc-800">
            <Megaphone className="mx-auto text-zinc-700" />
            <p className="mt-2 text-sm text-zinc-500">Todavía no se avisó a nadie.</p>
          </div>
        ) : (
          <>
            <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${(confirmados / p.avisos.length) * 100}%` }} /></div>
            <p className="mt-1 text-xs text-zinc-400">{confirmados} de {p.avisos.length} confirmaron</p>
            <ul className="mt-3 flex flex-col gap-2">
              {p.avisos.map((a) => (
                <li key={a.id} className="rounded-xl border border-zinc-800 bg-[#0b0b0c] p-3 flex items-start gap-3">
                  {a.enterado_at ? <Check size={18} className="text-emerald-400 mt-0.5" /> : <Clock size={18} className="text-amber-300 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{a.usuario_nombre}</p>
                    <p className="text-xs text-zinc-500">{a.enterado_at ? `Confirmó ${fechaHora(a.enterado_at)}` : `Avisado ${fechaHora(a.enviado_at)} por ${a.enviado_por} · sin confirmar`}</p>
                    {a.comentario && <p className="mt-1 text-sm text-zinc-300">“{a.comentario}”</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Avisar" className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4 h-fit">
        <h3 className="text-sm font-semibold text-white">Avisar a líderes de área</h3>
        <p className="text-xs text-zinc-500 mt-0.5">Les llega a la campanita (y al celular si tienen la app). A quien ya avisaste, se le vuelve a pedir confirmación.</p>
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} aria-label="Mensaje" className={`${campo} mt-3 resize-y`} />
        <ul className="mt-3 grid grid-cols-2 gap-1.5">
          {usuarios.map((u) => (
            <li key={u.id}>
              <label className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm cursor-pointer ${sel.includes(u.id) ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"}`}>
                <input type="checkbox" checked={sel.includes(u.id)} onChange={() => alternar(u.id)} className="accent-[#FF5A00]" />
                <span className="truncate">{u.nombre}</span>
              </label>
            </li>
          ))}
        </ul>
        <button onClick={enviar} disabled={!sel.length || !mensaje.trim()} className={`${botonPrimario} mt-4 w-full`}><Send size={16} /> Avisar a {sel.length || "…"}</button>
      </section>
    </div>
  );
}
