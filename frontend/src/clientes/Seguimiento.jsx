import { UserMinus } from "lucide-react";
import { Vacio } from "../produccion/ui";
import { BellRing } from "lucide-react";
import Tarjeta from "./Tarjeta";

/** Lo que se sigue o ya se trabajó (las que cierran antes, primero) y los clientes que dejaron de comprar. */
export default function Seguimiento({ items, dormidos, onCopiar, onCambiar, onBorrador }) {
  return (
    <div className="flex flex-col gap-10">
      <section>
        {items.length === 0 ? (
          <Vacio icono={BellRing} titulo="Todavía no seguís ninguna oportunidad" texto="En cualquier oportunidad tocá «Seguir»: te aviso cuando se acerca el cierre y busco novedades." />
        ) : (
          <div className="flex flex-col gap-5">{items.map((o, i) => <Tarjeta key={o.id} o={o} i={i} onCopiar={onCopiar} onCambiar={onCambiar} onBorrador={onBorrador} />)}</div>
        )}
      </section>
      {dormidos.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.1em] text-violet-300"><UserMinus size={16} /> Clientes que dejaron de comprar</h2>
          <p className="mt-1.5 text-sm text-zinc-500">Compraban seguido y hace más de un año que no piden. Es la forma más barata de vender: recuperarlos.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {dormidos.map((d) => (
              <li key={d.cliente} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 flex items-center gap-3">
                <b className="text-zinc-100 mr-auto min-w-0 truncate">{d.cliente}</b>
                <span className="text-sm text-zinc-500 shrink-0">{d.pedidos} pedidos · último hace {d.dias >= 365 ? `${Math.floor(d.dias / 365)} ${d.dias < 730 ? "año" : "años"}` : `${Math.round(d.dias / 30)} meses`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
