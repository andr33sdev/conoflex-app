import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Trash2, XCircle } from "lucide-react";
import { Boton, Chip, Etiqueta, Modal, Vacio } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { api, diaMes, num, turnoLabel } from "../produccion/util";

const PAGINA = 12;

function Dato({ t, v }) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">{t}</span>
      <span className="block mt-0.5 text-sm font-semibold text-zinc-200 tabular-nums">{v || "—"}</span>
    </div>
  );
}

/** Una carga como fila de la tabla; el detalle y las confirmaciones (rechazar / eliminar) se abren debajo de la misma fila. */
function Fila({ c, estado, onResuelto, toast }) {
  const pendiente = estado === "PENDIENTE";
  const [abierta, setAbierta] = useState(false);
  const [modo, setModo] = useState(null); // "rechazar" | "eliminar"
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const buenas = c.total_producido - c.fallas;

  const eliminar = async (sacarDeTablet) => {
    setOcupado(true);
    try {
      await api(`/api/prod/cargas/${c.id}${sacarDeTablet ? "?sacar_de_tablet=1" : ""}`, { method: "DELETE" });
      toast(
        c.estado === "APROBADA"
          ? sacarDeTablet ? "Producción eliminada y sacada de la tablet. Volvieron la materia prima y el stock del semielaborado." : "Producción eliminada. Volvieron la materia prima y el stock del semielaborado; la tablet puede volver a cargarla."
          : sacarDeTablet ? "Carga eliminada y sacada de la tablet." : "Carga eliminada.",
      );
      onResuelto();
    } catch (e) {
      toast(e.message, "error");
      setOcupado(false);
    }
  };

  const resolver = async (accion, body) => {
    setOcupado(true);
    try {
      await api(`/api/prod/cargas/${c.id}/${accion}`, { method: "PUT", body });
      toast(accion === "aprobar" ? "Carga aprobada: figura en métricas, se descontó la materia prima y se sumó al stock del semielaborado" : "Carga rechazada: el operario la va a ver para corregirla");
      onResuelto();
    } catch (e) {
      toast(e.message, "error");
      setOcupado(false);
    }
  };

  const celda = "px-3 py-3 align-middle";
  const hayDebajo = abierta || modo;
  return (
    <Fragment>
      <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={`border-t border-white/[0.06] hover:bg-white/[0.03] transition-colors ${hayDebajo ? "bg-white/[0.03]" : ""}`}>
        <td className={`${celda} w-9 pr-0`}>
          <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} aria-label={abierta ? "Ocultar detalle" : "Ver detalle"} className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.08] cursor-pointer">
            <ChevronDown size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
          </button>
        </td>
        <td className={celda}><span className="font-mono text-[12px] font-bold text-[#FFD60A]">{c.lote}</span></td>
        <td className={`${celda} whitespace-nowrap text-sm text-zinc-300`}>{diaMes(c.fecha)}<span className="block text-xs text-zinc-500">{turnoLabel(c.turno)}</span></td>
        <td className={`${celda} min-w-[180px]`}>
          <span className="block text-sm font-bold text-white leading-snug">{c.modelo_nombre}</span>
          <span className="block text-xs text-zinc-500">{c.maquina} · {c.operario}</span>
        </td>
        <td className={`${celda} text-right tabular-nums text-sm font-semibold text-zinc-200`}>{num(c.total_producido)}</td>
        <td className={`${celda} text-right tabular-nums text-sm font-extrabold text-emerald-300`}>{num(buenas)}</td>
        <td className={`${celda} text-right tabular-nums text-sm font-semibold ${c.fallas > 0 ? "text-rose-300" : "text-zinc-500"}`}>{num(c.fallas)}</td>
        <td className={celda}>
          {c.estado === "APROBADA" && <Chip tono="verde" icono={CheckCircle2}>Aprobada</Chip>}
          {c.estado === "RECHAZADA" && <Chip tono="rojo" icono={XCircle}>Rechazada</Chip>}
          {c.estado === "PENDIENTE" && <Chip tono="amarillo">Por aprobar</Chip>}
        </td>
        <td className={`${celda} text-right whitespace-nowrap`}>
          {pendiente ? (
            <span className="inline-flex items-center gap-1.5">
              <Boton variante="primario" icono={CheckCircle2} onClick={() => resolver("aprobar")} disabled={ocupado}>Aprobar</Boton>
              <Boton variante="fantasma" onClick={() => setModo(modo === "rechazar" ? null : "rechazar")} disabled={ocupado}>Rechazar</Boton>
              <Boton variante="fantasma" icono={Trash2} onClick={() => setModo(modo === "eliminar" ? null : "eliminar")} aria-label="Eliminar carga" disabled={ocupado} />
            </span>
          ) : (
            <Boton variante="fantasma" icono={Trash2} onClick={() => setModo(modo === "eliminar" ? null : "eliminar")} aria-label="Eliminar" disabled={ocupado} className="text-zinc-500 hover:text-rose-300" />
          )}
        </td>
      </motion.tr>
      {hayDebajo && (
        <tr className="bg-white/[0.025]">
          <td colSpan={9} className="px-4 pb-4 pt-1">
            <AnimatePresence initial={false} mode="popLayout">
              {abierta && (
                <motion.div key="d" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
                    <Dato t="Ciclos" v={num(c.ciclos)} />
                    <Dato t="Kg por producto" v={num(c.kg_por_producto, 3)} />
                    <Dato t="Kg totales" v={num(c.kg_por_producto * c.total_producido, 1)} />
                    <Dato t="Color" v={c.color} />
                    <Dato t="Código de material" v={c.codigo_material} />
                  </div>
                  {c.observaciones && <p className="mt-2 text-sm text-zinc-300 bg-white/[0.04] rounded-xl px-3 py-2">“{c.observaciones}”</p>}
                  {c.estado === "RECHAZADA" && c.motivo_rechazo && <p className="mt-2 text-sm text-rose-200">Motivo del rechazo: {c.motivo_rechazo}</p>}
                  {pendiente && <p className="mt-2 text-xs text-zinc-500 leading-snug">Aprobar: se suma a las métricas y se descuenta la materia prima. Rechazar: el operario la ve en la tablet para corregirla; no se toca el stock.</p>}
                </motion.div>
              )}
              {modo === "rechazar" && (
                <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3.5">
                  <div>
                    <Etiqueta>¿Qué hay que corregir?</Etiqueta>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Ej: el total no coincide con los ciclos" className={campo} />
                  </div>
                  <div className="flex gap-2">
                    <Boton variante="peligro" onClick={() => resolver("rechazar", { motivo })} disabled={ocupado}>Rechazar carga</Boton>
                    <Boton variante="fantasma" onClick={() => setModo(null)}>Volver</Boton>
                  </div>
                </motion.div>
              )}
              {modo === "eliminar" && (
                <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5">
                  <p className="text-sm text-rose-100 leading-snug">
                    {c.estado === "APROBADA"
                      ? "Se saca de métricas, vuelve al stock la materia prima usada y se restan del semielaborado las piezas que había sumado. ¿Qué hacemos con la tablet?"
                      : "Se elimina esta carga. ¿Qué hacemos con la tablet?"}
                  </p>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Boton variante="peligro" onClick={() => eliminar(false)} disabled={ocupado} icono={Trash2}>Eliminar y dejar que la carguen de nuevo</Boton>
                    <Boton variante="peligro" onClick={() => eliminar(true)} disabled={ocupado} icono={Trash2}>Eliminar y sacar de la tablet</Boton>
                    <Boton variante="fantasma" onClick={() => setModo(null)} disabled={ocupado}>No</Boton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function Paginacion({ pagina, total, onCambiar }) {
  const paginas = Math.max(1, Math.ceil(total / PAGINA));
  if (total <= PAGINA) return null;
  const desde = (pagina - 1) * PAGINA + 1;
  const hasta = Math.min(total, pagina * PAGINA);
  const btn = "w-10 h-10 grid place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors";
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-sm text-zinc-500 tabular-nums">{desde}–{hasta} de {total}</p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onCambiar(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior"><ChevronLeft size={18} /></button>
        <span className="text-sm font-bold text-zinc-300 tabular-nums px-1">{pagina} / {paginas}</span>
        <button type="button" className={btn} onClick={() => onCambiar(pagina + 1)} disabled={pagina >= paginas} aria-label="Página siguiente"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

export default function Cargas({ abierto, onCerrar, onCambio, toast }) {
  const [estado, setEstado] = useState("PENDIENTE");
  const [dato, setDato] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [pag, setPag] = useState({ estado: "PENDIENTE", n: 1 });
  const clave = `${estado}|${version}`;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    api(`/api/prod/cargas?estado=${estado}`)
      .then((d) => vivo && (setDato({ filas: d, clave }), setError("")))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [abierto, estado, version, clave]);

  const cargando = !error && (!dato || dato.clave !== clave);
  const total = dato?.filas.length || 0;
  const paginas = Math.max(1, Math.ceil(total / PAGINA));
  const pagina = Math.min(pag.estado === estado ? pag.n : 1, paginas);
  const visibles = dato && !cargando ? dato.filas.slice((pagina - 1) * PAGINA, pagina * PAGINA) : [];
  const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500";

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Producción cargada desde la tablet" subtitulo="Revisá lo que cargaron los operarios antes de que cuente." ancho="max-w-6xl">
      <div role="tablist" className="inline-flex p-1 rounded-xl bg-white/[0.05] border border-white/[0.07] mb-5">
        {[["PENDIENTE", "Por aprobar"], ["APROBADA", "Aprobadas"], ["RECHAZADA", "Rechazadas"]].map(([id, t]) => (
          <button key={id} role="tab" aria-selected={estado === id} onClick={() => setEstado(id)} className={`min-h-[38px] px-4 rounded-lg text-sm font-bold transition-colors cursor-pointer ${estado === id ? "bg-[#FF5A00] text-black" : "text-zinc-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : cargando ? (
        <div className="flex items-center justify-center gap-3 py-14 text-zinc-500"><Loader2 className="animate-spin" size={20} /> Cargando…</div>
      ) : total === 0 ? (
        <Vacio icono={ClipboardCheck} titulo={estado === "PENDIENTE" ? "No hay cargas por aprobar" : "Nada para mostrar"} texto={estado === "PENDIENTE" ? "Cuando un operario cargue lo producido en la tablet, aparece acá." : ""} />
      ) : (
        <>
          <div className="rounded-2xl border border-white/[0.08] bg-[#131317] overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[900px] text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className={`${th} w-9`} />
                  <th className={th}>Lote</th>
                  <th className={th}>Día</th>
                  <th className={th}>Producto</th>
                  <th className={`${th} text-right`}>Producido</th>
                  <th className={`${th} text-right`}>Buenas</th>
                  <th className={`${th} text-right`}>Fallas</th>
                  <th className={th}>Estado</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {visibles.map((c) => (
                    <Fila key={c.id} c={c} estado={estado} toast={toast} onResuelto={() => { setVersion((v) => v + 1); onCambio(); }} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} total={total} onCambiar={(n) => setPag({ estado, n })} />
        </>
      )}
    </Modal>
  );
}
