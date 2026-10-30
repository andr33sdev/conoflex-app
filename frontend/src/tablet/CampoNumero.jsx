import { Minus, Plus } from "lucide-react";

/** Campo numérico grande para tablet: se puede tipear o tocar − / +. */
export default function CampoNumero({ etiqueta, valor, onChange, paso = 1, decimal = false, ayuda, error, autoFocus, sufijo }) {
  const cambiar = (delta) => {
    const actual = Number(String(valor).replace(",", ".")) || 0;
    const siguiente = Math.max(0, Math.round((actual + delta) * 1000) / 1000);
    onChange(String(siguiente));
  };
  return (
    <div>
      <label className="block">
        <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">{etiqueta}</span>
        <div className={`flex items-stretch rounded-2xl border bg-[#17171c] overflow-hidden transition-colors ${error ? "border-rose-500/70" : "border-white/[0.1] focus-within:border-[#FF5A00]"}`}>
          <button type="button" onClick={() => cambiar(-paso)} aria-label={`Restar a ${etiqueta}`} className="w-16 shrink-0 grid place-items-center text-zinc-300 hover:bg-white/[0.07] active:bg-white/[0.12] cursor-pointer">
            <Minus size={24} />
          </button>
          <div className="flex-1 min-w-0 flex items-center justify-center border-x border-white/[0.07]">
            <input
              value={valor}
              onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode={decimal ? "decimal" : "numeric"}
              autoFocus={autoFocus}
              placeholder="0"
              className="w-full min-w-0 bg-transparent text-center text-3xl font-extrabold text-white placeholder:text-zinc-700 py-4 focus:outline-none tabular-nums"
            />
            {sufijo && <span className="pr-3 text-sm font-bold text-zinc-500 shrink-0">{sufijo}</span>}
          </div>
          <button type="button" onClick={() => cambiar(paso)} aria-label={`Sumar a ${etiqueta}`} className="w-16 shrink-0 grid place-items-center text-[#FFD60A] hover:bg-white/[0.07] active:bg-white/[0.12] cursor-pointer">
            <Plus size={24} />
          </button>
        </div>
      </label>
      {error ? <p className="mt-1.5 text-sm font-semibold text-rose-300">{error}</p> : ayuda ? <p className="mt-1.5 text-sm text-zinc-500">{ayuda}</p> : null}
    </div>
  );
}
