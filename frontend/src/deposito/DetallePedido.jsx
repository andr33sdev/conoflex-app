import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, PackageCheck, Truck, Undo2 } from "lucide-react";
import { api } from "../produccion/util";
import { Boton, Drawer, Modal } from "../produccion/ui";
import { cant, fechaCorta, fechaHora, primerNombre, rutaPedido } from "./formato";

function Marca({ titulo, en, por, planilla, icono: Icono, tono }) {
  const hecho = en || planilla;
  return (
    <div className={`rounded-2xl border p-3.5 ${hecho ? tono : "border-white/[0.07] bg-white/[0.03]"}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500"><Icono size={13} /> {titulo}</span>
      <strong className={`block mt-1 text-[15px] ${hecho ? "text-white" : "text-zinc-600"}`}>{en ? fechaHora(en) : planilla ? planilla : "Todavía no"}</strong>
      <span className="block text-xs text-zinc-500 mt-0.5">{en ? `por ${primerNombre(por)}` : planilla ? "según la planilla" : " "}</span>
    </div>
  );
}

/** Tabla de semielaborados: cuánto lleva el pedido, stock del 33 y cuánto queda. */
export function TablaSemis({ semis, descontado }) {
  if (descontado) {
    return (
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-zinc-500"><th className="text-left px-3 py-2">Semielaborado</th><th className="text-right px-3 py-2">Se descontó</th><th className="text-right px-3 py-2">Había</th></tr></thead>
          <tbody>
            {descontado.map((s) => (
              <tr key={s.semielaborado_id} className="border-t border-white/[0.05]">
                <td className="px-3 py-2"><span className="font-mono text-xs font-bold text-[#FFD60A]">{s.codigo}</span> <span className="text-zinc-300">{s.nombre}</span></td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-white">−{cant(s.cantidad)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{cant(s.stock_antes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-white/[0.03] text-[11px] uppercase tracking-[0.08em] text-zinc-500"><th className="text-left px-3 py-2">Semielaborado</th><th className="text-right px-3 py-2">Lleva</th><th className="text-right px-3 py-2">Stock 33</th><th className="text-right px-3 py-2">Queda</th></tr></thead>
        <tbody>
          {semis.map((s) => (
            <tr key={s.semielaborado_id} className="border-t border-white/[0.05]">
              <td className="px-3 py-2"><span className="font-mono text-xs font-bold text-[#FFD60A]">{s.codigo}</span> <span className="text-zinc-300">{s.nombre}</span></td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-white">{cant(s.cantidad)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{cant(s.stock_33)}</td>
              <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.queda < 0 ? "text-rose-300" : "text-zinc-200"}`}>{cant(s.queda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmación antes de despachar: qué se descuenta del 33. */
export function ConfirmarDespacho({ pedido, onCerrar, onConfirmar }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (!pedido) return;
    api(rutaPedido(pedido)).then(setD).catch((e) => setError(e.message));
  }, [pedido]);
  const negativos = d?.semis.filter((s) => s.queda < 0) || [];
  const confirmar = async () => {
    setEnviando(true);
    try {
      await onConfirmar();
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal
      abierto={!!pedido}
      onCerrar={onCerrar}
      titulo={pedido ? `Despachar OP ${pedido.op}` : ""}
      subtitulo={pedido?.cliente}
      pie={
        <div className="flex gap-2.5 justify-end">
          <Boton onClick={onCerrar} variante="fantasma">Cancelar</Boton>
          <Boton onClick={confirmar} variante="naranja" icono={enviando ? Loader2 : Truck} disabled={!d || enviando} grande>Despachar</Boton>
        </div>
      }
    >
      {error ? <p className="text-sm text-rose-300">{error}</p> : !d ? (
        <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-zinc-600" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400">{d.semis.length ? "Se descuenta del stock del 33:" : "Ningún artículo tiene ingeniería cargada: no se va a descontar nada del 33."}</p>
          {d.semis.length > 0 && <TablaSemis semis={d.semis} />}
          {d.sin_receta.length > 0 && (
            <p className="flex gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> Sin ingeniería (no descuentan): {d.sin_receta.join(", ")}.</p>
          )}
          {negativos.length > 0 && (
            <p className="flex gap-2 text-sm text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2.5"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {negativos.length === 1 ? "1 semielaborado queda" : `${negativos.length} semielaborados quedan`} en negativo. Se despacha igual; revisá el stock.</p>
          )}
          {d.espejo_activo && (
            <p className="flex gap-2 text-sm text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5"><AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-300" /> La sincronización del 33 con la planilla está activa: en unos minutos el stock vuelve a quedar como en la planilla.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Panel con todo el pedido: artículos, semielaborados y quién lo armó/despachó. */
export default function DetallePedido({ pedido, onCerrar, onArmar, onDespachar, onCambio, aviso }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [deshaciendo, setDeshaciendo] = useState(false);
  const cargar = useCallback(() => {
    if (!pedido) return;
    setError("");
    api(rutaPedido(pedido)).then(setD).catch((e) => setError(e.message));
  }, [pedido]);
  useEffect(() => {
    // Carga del pedido al abrir el panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const p = d?.pedido;
  const deshacer = async () => {
    setDeshaciendo(true);
    try {
      const r = await api(`${rutaPedido(pedido)}/deshacer`, { method: "POST" });
      aviso(r.deshecho === "despacho" ? "Despacho deshecho: el stock volvió al 33." : "Armado deshecho: volvió a por armar.");
      onCambio();
      cargar();
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setDeshaciendo(false);
    }
  };
  const marcadoEnApp = p && (p.armado_at || p.despachado_at);

  return (
    <Drawer
      abierto={!!pedido}
      onCerrar={onCerrar}
      titulo={pedido ? <span>OP <span className="text-[#FFD60A]">{pedido.op}</span></span> : ""}
      subtitulo={pedido ? `${pedido.cliente} · ${fechaCorta(pedido.fecha)}` : ""}
      pie={p && (
        <div className="flex flex-wrap gap-2.5 justify-end">
          {marcadoEnApp && <Boton onClick={deshacer} variante="fantasma" icono={deshaciendo ? Loader2 : Undo2} disabled={deshaciendo}>{p.despachado_at ? "Deshacer despacho" : "Deshacer armado"}</Boton>}
          {p.etapa === "PENDIENTE" && <Boton onClick={() => onArmar(pedido)} icono={PackageCheck}>Armar pedido</Boton>}
          {p.etapa !== "DESPACHADO" && <Boton onClick={() => onDespachar(pedido)} variante="naranja" icono={Truck}>Despachar pedido</Boton>}
        </div>
      )}
    >
      {error ? <p className="text-sm text-rose-300">{error}</p> : !d ? (
        <div className="py-16 grid place-items-center"><Loader2 className="animate-spin text-zinc-600" /></div>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-2 gap-2.5">
            <Marca titulo="Armado" icono={PackageCheck} en={p.armado_at} por={p.armado_por} planilla={p.armado_txt} tono="border-sky-400/25 bg-sky-400/[0.06]" />
            <Marca titulo="Despachado" icono={Truck} en={p.despachado_at} por={p.despachado_por} planilla={p.despachado_txt} tono="border-emerald-400/25 bg-emerald-400/[0.06]" />
          </div>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-2.5">Artículos</h3>
            <ul className="rounded-2xl border border-white/[0.07] divide-y divide-white/[0.05]">
              {d.items.map((it, i) => (
                <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="w-12 shrink-0 text-right text-base font-extrabold tabular-nums text-white">{cant(it.cantidad)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-zinc-100 truncate">{it.modelo}</span>
                    {it.detalles && <span className="block text-xs text-zinc-500 truncate">{it.detalles}</span>}
                  </span>
                  {!it.tiene_receta && <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/[0.07] px-2 py-0.5 text-[11px] font-bold text-amber-200">sin ingeniería</span>}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-2.5">{p.despachado_at ? "Lo que se descontó del 33" : p.despachado_en_planilla ? "Semielaborados" : "Semielaborados que lleva"}</h3>
            {p.despachado_at ? (
              d.descontado.length ? <TablaSemis descontado={d.descontado} /> : <p className="text-sm text-zinc-500">No se descontó nada (ningún artículo tenía ingeniería).</p>
            ) : p.despachado_en_planilla ? (
              <p className="text-sm text-zinc-500">Se despachó desde la planilla: su stock se descontó allá.</p>
            ) : d.semis.length ? (
              <>
                <TablaSemis semis={d.semis} />
                {p.etapa === "ARMADO" && <p className="mt-2 text-xs text-zinc-500">Están comprometidos en el 33 hasta que se despache.</p>}
              </>
            ) : (
              <p className="text-sm text-zinc-500">Ningún artículo tiene ingeniería cargada.</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
