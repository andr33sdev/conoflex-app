// Revisión contra el procedimiento P-11 (ISO 9001 · 8.3): qué está documentado y qué falta.
import { CheckCircle2, Circle } from "lucide-react";
import { Modal } from "./util";

export default function RevisionIso({ p, onCerrar }) {
  const { iso } = p;
  return (
    <Modal titulo="Revisión ISO 9001 · P-11" subtitulo={iso.completo ? "Todo documentado: el proyecto está listo para una auditoría." : `${iso.ok} de ${iso.total} requisitos cumplidos.`} onCerrar={onCerrar}>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${iso.pct}%`, background: iso.completo ? "#34d399" : "#FF5A00" }} /></div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {iso.items.map((x) => (
          <li key={x.id} className="flex items-start gap-3">
            {x.ok ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" /> : <Circle size={20} className="text-zinc-600 shrink-0" />}
            <div>
              <p className={`text-sm ${x.ok ? "text-zinc-300" : "text-white font-medium"}`}>{x.texto}</p>
              {!x.ok && x.como && <p className="text-xs text-zinc-500 mt-0.5">{x.como}</p>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-zinc-600">El registro (R.032) se arma solo con lo cargado: desde «Más → Imprimir R.032» sale listo para el auditor.</p>
    </Modal>
  );
}
