import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ClipboardCheck, Loader2, Trash2, XCircle } from "lucide-react";
import { Boton, Chip, Etiqueta, Modal, Vacio } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { api, diaMes, num, turnoLabel } from "../produccion/util";

function Dato({ t, v, destacado }) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">{t}</span>
      <span className={`block mt-0.5 tabular-nums ${destacado ? "text-lg font-extrabold text-white" : "text-sm font-semibold text-zinc-200"}`}>{v || "—"}</span>
    </div>
  );
}

function Tarjeta({ c, pendiente, onResuelto, toast }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const buenas = c.total_producido - c.fallas;

  const [eliminando, setEliminando] = useState(false);
  const eliminar = async (sacarDeTablet) => {
    setOcupado(true);
    try {
      await api(`/api/prod/cargas/${c.id}${sacarDeTablet ? "?sacar_de_tablet=1" : ""}`, { method: "DELETE" });
      toast(
        c.estado === "APROBADA"
          ? sacarDeTablet ? "Producción eliminada y sacada de la tablet. La materia prima volvió al stock." : "Producción eliminada. La materia prima volvió al stock y la tablet puede volver a cargarla."
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
      toast(accion === "aprobar" ? "Carga aprobada: ya figura en métricas y se descontó la materia prima" : "Carga rechazada: el operario la va a ver para corregirla");
      onResuelto();
    } catch (e) {
      toast(e.message, "error");
      setOcupado(false);
    }
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.25 }} className="rounded-2xl border border-white/[0.08] bg-[#131317] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] font-bold text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/25 rounded-lg px-2 py-0.5">{c.lote}</span>
        <Chip>{diaMes(c.fecha)} · {turnoLabel(c.turno)}</Chip>
        {c.estado === "APROBADA" && <Chip tono="verde" icono={CheckCircle2}>Aprobada</Chip>}
        {c.estado === "RECHAZADA" && <Chip tono="rojo" icono={XCircle}>Rechazada</Chip>}
      </div>
      <p className="mt-2 text-base font-bold text-white leading-snug">{c.modelo_nombre}</p>
      <p className="text-xs text-zinc-500">{c.maquina} · cargó {c.operario}</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Dato destacado t="Total producido" v={num(c.total_producido)} />
        <Dato destacado t="Piezas buenas" v={num(buenas)} />
        <Dato t="Fallas" v={num(c.fallas)} />
        <Dato t="Ciclos" v={num(c.ciclos)} />
        <Dato t="Kg por producto" v={num(c.kg_por_producto, 3)} />
        <Dato t="Kg totales" v={num(c.kg_por_producto * c.total_producido, 1)} />
        <Dato t="Color" v={c.color} />
        <Dato t="Código de material" v={c.codigo_material} />
      </div>
      {c.observaciones && <p className="mt-3 text-sm text-zinc-300 bg-white/[0.04] rounded-xl px-3 py-2">“{c.observaciones}”</p>}
      {c.estado === "RECHAZADA" && c.motivo_rechazo && <p className="mt-3 text-sm text-rose-200">Motivo: {c.motivo_rechazo}</p>}

      <div className="mt-4">
        <AnimatePresence initial={false} mode="wait">
          {eliminando ? (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5">
              <p className="text-sm text-rose-100 leading-snug">
                {c.estado === "APROBADA"
                  ? "Se saca de métricas y la materia prima que se descontó vuelve al stock (queda en su historial). ¿Qué hacemos con la tablet?"
                  : "Se elimina esta carga. ¿Qué hacemos con la tablet?"}
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <Boton variante="peligro" onClick={() => eliminar(false)} disabled={ocupado} icono={Trash2}>Eliminar y dejar que la carguen de nuevo</Boton>
                <Boton variante="peligro" onClick={() => eliminar(true)} disabled={ocupado} icono={Trash2}>Eliminar y sacar de la tablet</Boton>
                <Boton variante="fantasma" onClick={() => setEliminando(false)} disabled={ocupado}>No</Boton>
              </div>
            </motion.div>
          ) : (
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {!pendiente && <button type="button" onClick={() => setEliminando(true)} className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-sm font-bold text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={15} /> Eliminar{c.estado === "APROBADA" ? " producción" : ""}</button>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {pendiente && !eliminando && (
        <div className="mt-2">
          <AnimatePresence initial={false} mode="wait">
            {rechazando ? (
              <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
                <div>
                  <Etiqueta>¿Qué hay que corregir?</Etiqueta>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Ej: el total no coincide con los ciclos" className={campo} />
                </div>
                <div className="flex gap-2">
                  <Boton variante="peligro" onClick={() => resolver("rechazar", { motivo })} disabled={ocupado}>Rechazar carga</Boton>
                  <Boton variante="fantasma" onClick={() => setRechazando(false)}>Volver</Boton>
                </div>
              </motion.div>
            ) : (
              <motion.div key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                <Boton variante="primario" icono={CheckCircle2} onClick={() => resolver("aprobar")} disabled={ocupado}>Aprobar</Boton>
                <Boton variante="fantasma" onClick={() => setRechazando(true)}>Rechazar…</Boton>
                <Boton variante="fantasma" icono={Trash2} onClick={() => setEliminando(true)} aria-label="Eliminar carga" className="ml-auto" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
}

export default function Cargas({ abierto, onCerrar, onCambio, toast }) {
  const [estado, setEstado] = useState("PENDIENTE");
  const [dato, setDato] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
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

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Producción cargada desde la tablet" subtitulo="Al aprobar una carga se registra en métricas y se descuenta la materia prima según la receta." ancho="max-w-4xl">
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
      ) : dato.filas.length === 0 ? (
        <Vacio icono={ClipboardCheck} titulo={estado === "PENDIENTE" ? "No hay cargas por aprobar" : "Nada para mostrar"} texto={estado === "PENDIENTE" ? "Cuando un operario cargue lo producido en la tablet, aparece acá." : ""} />
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {dato.filas.map((c) => (
              <Tarjeta key={c.id} c={c} pendiente={estado === "PENDIENTE"} toast={toast} onResuelto={() => { setVersion((v) => v + 1); onCambio(); }} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Modal>
  );
}
