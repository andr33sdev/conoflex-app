import { AlertTriangle, CheckCircle2, Paperclip } from "lucide-react";

const peso = (n) => (n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Lo que hay que mirar antes de enviar el borrador: cuentas hechas por el sistema y dudas detectadas. */
export default function RevisionBorrador({ revision }) {
  if (!revision) return null;
  const hayAvisos = revision.avisos?.length > 0;
  return (
    <div className="bg-[#080808] border border-zinc-800/80 rounded-xl p-5 space-y-3" role="region" aria-label="Revisión del borrador">
      <h4 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
        {hayAvisos ? <AlertTriangle size={14} className="text-amber-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
        Revisá el borrador antes de enviarlo
      </h4>
      <p className="text-[11px] text-zinc-400">
        Los precios los calculó el sistema con tu lista{revision.descuento_pct ? `, aplicando ${revision.descuento_pct}% de descuento` : " (sin descuento)"}.
        {revision.adjunta_lista ? " La lista de precios en PDF quedó adjunta al borrador." : ""}
      </p>
      {revision.lineas?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-zinc-500 uppercase tracking-wider text-[10px]">
                <th className="py-1.5 pr-3 font-bold">Producto</th>
                <th className="py-1.5 pr-3 font-bold">Cant.</th>
                <th className="py-1.5 pr-3 font-bold text-right">Lista</th>
                <th className="py-1.5 pr-3 font-bold text-right">C/desc.</th>
                <th className="py-1.5 font-bold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {revision.lineas.map((l) => (
                <tr key={l.id} className="border-t border-zinc-800/80 text-zinc-200">
                  <td className="py-1.5 pr-3"><b className="text-white">{l.nombre}</b> <span className="text-zinc-500">{l.codigo}</span></td>
                  <td className="py-1.5 pr-3">{l.cantidad ? `${l.cantidad}${l.unidad && l.unidad !== "u" ? ` ${l.unidad}` : ""}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{peso(l.lista)}</td>
                  <td className="py-1.5 pr-3 text-right">{peso(l.con_descuento)}</td>
                  <td className="py-1.5 text-right font-bold text-white">{peso(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hayAvisos && (
        <ul className="space-y-1.5">
          {revision.avisos.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-amber-300 leading-snug"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span>{a}</span></li>
          ))}
        </ul>
      )}
      {!hayAvisos && <p className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> No detecté dudas: igual leelo completo en Gmail.</p>}
      {revision.adjunta_lista && <p className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Paperclip size={12} /> Lista_de_Precios_Conoflex.pdf</p>}
    </div>
  );
}
