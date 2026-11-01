import { useEffect, useState } from "react";
import { api } from "../produccion/util";

const RAPIDOS = [5, 10, 15, 20, 25, 30];

export default function SelectorDescuento({ email, valor, onChange, compacto = false }) {
  const [sug, setSug] = useState(null);
  const [otro, setOtro] = useState("");

  useEffect(() => {
    let vivo = true;
    api(`/api/comercial/descuento-sugerido?email=${encodeURIComponent(email || "")}`)
      .then((r) => vivo && setSug(r))
      .catch(() => vivo && setSug(null));
    return () => { vivo = false; };
  }, [email]);

  const sugerencias = [];
  if (sug?.cliente) sugerencias.push({ pct: sug.cliente.pct, texto: `${sug.cliente.pct ? sug.cliente.pct + "%" : "Sin descuento"} · ${sug.cliente.motivo}` });
  if (sug?.config && !sugerencias.some((s) => s.pct === sug.config)) sugerencias.push({ pct: sug.config, texto: `${sug.config}% · el habitual de las reglas` });

  const elegir = (v) => { setOtro(""); onChange(v); };
  const activo = (t) => (t === "sin" ? valor?.sin === true : valor && !valor.sin && valor.pct === t);
  const boton = (activa) => `min-h-[38px] px-3 rounded-lg text-[13px] font-semibold border transition-colors ${activa ? "bg-white text-black border-white" : "bg-white/[0.05] text-zinc-200 border-white/10 hover:bg-white/[0.1]"}`;

  return (
    <div className={compacto ? "" : "rounded-xl border border-zinc-800 bg-[#0d0d0e] p-4"}>
      <p className="text-[13px] font-semibold text-white">¿Lleva descuento? <span className="font-normal text-zinc-500">Elegí uno antes de armar el borrador.</span></p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Descuento del presupuesto">
        <button type="button" onClick={() => elegir({ sin: true })} aria-pressed={activo("sin")} className={boton(activo("sin"))}>Sin descuento</button>
        {RAPIDOS.map((p) => <button key={p} type="button" onClick={() => elegir({ pct: p })} aria-pressed={activo(p)} className={boton(activo(p))}>{p}%</button>)}
        <input
          value={otro}
          inputMode="decimal"
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.,]/g, "");
            setOtro(t);
            const n = Number(t.replace(",", "."));
            if (t && Number.isFinite(n) && n >= 0 && n <= 60) onChange({ pct: n });
            else onChange(null);
          }}
          placeholder="Otro %"
          aria-label="Otro porcentaje de descuento"
          className="w-24 min-h-[38px] rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 px-3 text-base text-white placeholder-zinc-600 outline-none"
        />
      </div>
      {sugerencias.length > 0 && (
        <p className="mt-2 text-[12.5px] text-zinc-500 leading-snug">
          Sugerencia: {sugerencias.map((s, i) => (
            <button key={i} type="button" onClick={() => elegir({ pct: s.pct })} className="mr-2 underline underline-offset-2 text-zinc-300 hover:text-white">{s.texto}</button>
          ))}
        </p>
      )}
      {sug?.notas?.length > 0 && <p className="mt-1 text-[12px] text-zinc-600 leading-snug">Reglas anotadas: {sug.notas.join(" · ")}</p>}
    </div>
  );
}
