import { useEffect, useState } from "react";
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

function Metrica({ t, v, tono = "text-zinc-200" }) {
  return (
    <div className="rounded-lg bg-black/25 px-3 py-2 text-center">
      <span className="block text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">{t}</span>
      <span className={`block text-lg font-extrabold tabular-nums ${tono}`}>{v}</span>
    </div>
  );
}

// Una carga como tarjeta: se lee de un vistazo y las acciones (aprobar / rechazar / eliminar) están a la mano.
function Tarjeta({ c, estado, onResuelto, toast }) {
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

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-white/[0.08] bg-[#131317] p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-[#FFD60A]">{c.lote}</span>
            {c.estado === "APROBADA" && <Chip tono="verde" icono={CheckCircle2}>Aprobada</Chip>}
            {c.estado === "RECHAZADA" && <Chip tono="rojo" icono={XCircle}>Rechazada</Chip>}
            {c.estado === "PENDIENTE" && <Chip tono="amarillo">Por aprobar</Chip>}
          </div>
          <p className="mt-1 text-[15px] font-bold text-white leading-snug">{c.modelo_nombre}</p>
          <p className="text-xs text-zinc-500">{diaMes(c.fecha)} · {turnoLabel(c.turno)} · {c.maquina || "sin máquina"} · {c.operario}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metrica t="Producido" v={num(c.total_producido)} />
        <Metrica t="Buenas" v={num(buenas)} tono="text-emerald-300" />
        <Metrica t="Fallas" v={num(c.fallas)} tono={c.fallas > 0 ? "text-rose-300" : "text-zinc-400"} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-400 hover:text-white cursor-pointer">
          <ChevronDown size={15} className={`transition-transform ${abierta ? "rotate-180" : ""}`} /> {abierta ? "Ocultar detalle" : "Ver detalle"}
        </button>
        {pendiente ? (
          <span className="inline-flex items-center gap-1.5">
            <Boton variante="primario" icono={CheckCircle2} onClick={() => resolver("aprobar")} disabled={ocupado}>Aprobar</Boton>
            <Boton variante="fantasma" onClick={() => setModo(modo === "rechazar" ? null : "rechazar")} disabled={ocupado}>Rechazar</Boton>
            <Boton variante="fantasma" icono={Trash2} onClick={() => setModo(modo === "eliminar" ? null : "eliminar")} aria-label="Eliminar carga" disabled={ocupado} className="text-zinc-500 hover:text-rose-300" />
          </span>
        ) : (
          <Boton variante="fantasma" icono={Trash2} onClick={() => setModo(modo === "eliminar" ? null : "eliminar")} aria-label="Eliminar" disabled={ocupado} className="text-zinc-500 hover:text-rose-300">Eliminar</Boton>
        )}
      </div>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div key="d" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
              <Dato t="Ciclos" v={num(c.ciclos)} />
              <Dato t="Kg por producto" v={num(c.kg_por_producto, 3)} />
              <Dato t="Kg totales" v={num(c.kg_por_producto * c.total_producido, 1)} />
              <Dato t="Color" v={c.color} />
              <Dato t="Código de material" v={c.codigo_material} />
            </div>
            {c.observaciones && <p className="mt-2 text-sm text-zinc-300 bg-white/[0.04] rounded-xl px-3 py-2">“{c.observaciones}”</p>}
            {c.estado === "RECHAZADA" && c.motivo_rechazo && <p className="mt-2 text-sm text-rose-200">Motivo del rechazo: {c.motivo_rechazo}</p>}
            {pendiente && <p className="mt-2 text-xs text-zinc-500 leading-snug">Aprobar: suma a las métricas y descuenta la materia prima. Rechazar: el operario la ve en la tablet para corregirla; no se toca el stock.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {modo === "rechazar" && (
          <motion.div key="r" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.05] p-3.5">
              <div>
                <Etiqueta>¿Qué hay que corregir?</Etiqueta>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Ej: el total no coincide con los ciclos" className={campo} />
              </div>
              <div className="flex gap-2">
                <Boton variante="peligro" onClick={() => resolver("rechazar", { motivo })} disabled={ocupado}>Rechazar carga</Boton>
                <Boton variante="fantasma" onClick={() => setModo(null)}>Volver</Boton>
              </div>
            </div>
          </motion.div>
        )}
        {modo === "eliminar" && (
          <motion.div key="e" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
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
  const [confirmarTodas, setConfirmarTodas] = useState(false);
  const [aprobandoTodas, setAprobandoTodas] = useState(false);
  const clave = `${estado}|${version}`;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setConfirmarTodas(false);
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

  const aprobarTodas = async () => {
    setAprobandoTodas(true);
    let ok = 0;
    let err = 0;
    for (const c of dato.filas) {
      try { await api(`/api/prod/cargas/${c.id}/aprobar`, { method: "PUT" }); ok += 1; } catch { err += 1; }
    }
    toast(err ? `Se aprobaron ${ok}; ${err} no se pudieron (revisá stock de materia prima).` : `${ok} ${ok === 1 ? "carga aprobada" : "cargas aprobadas"}`, err ? "error" : undefined);
    setConfirmarTodas(false);
    setAprobandoTodas(false);
    setVersion((v) => v + 1);
    onCambio();
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Producción cargada desde la tablet" subtitulo="Revisá lo que cargaron los operarios antes de que cuente." ancho="max-w-4xl">
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
          {estado === "PENDIENTE" && (
            <div className="mb-4">
              {confirmarTodas ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3.5 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-emerald-100 flex-1 min-w-[200px]">Vas a aprobar las <b>{total}</b> cargas por aprobar. Se descuenta la materia prima y se suma al stock de cada semielaborado.</p>
                  <Boton variante="primario" icono={CheckCircle2} onClick={aprobarTodas} disabled={aprobandoTodas}>{aprobandoTodas ? "Aprobando…" : "Sí, aprobar todas"}</Boton>
                  <Boton variante="fantasma" onClick={() => setConfirmarTodas(false)} disabled={aprobandoTodas}>No</Boton>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-zinc-400"><b className="text-white tabular-nums">{total}</b> {total === 1 ? "carga por aprobar" : "cargas por aprobar"}</p>
                  <Boton variante="suave" icono={CheckCircle2} onClick={() => setConfirmarTodas(true)}>Aprobar todas</Boton>
                </div>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {visibles.map((c) => (
                <Tarjeta key={c.id} c={c} estado={estado} toast={toast} onResuelto={() => { setVersion((v) => v + 1); onCambio(); }} />
              ))}
            </AnimatePresence>
          </ul>
          <Paginacion pagina={pagina} total={total} onCambiar={(n) => setPag({ estado, n })} />
        </>
      )}
    </Modal>
  );
}
