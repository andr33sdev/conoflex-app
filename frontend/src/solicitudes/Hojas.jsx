import { useMemo, useState } from "react";
import { Ban, Check, ChevronRight, History, Minus, Pencil, Plus, Search, X } from "lucide-react";
import { Modal } from "../produccion/ui";
import { Campo, inputCls } from "./Piezas";
import { ChipEstado } from "./Piezas";
import { formatFechaArg, formatHoraArg, motivoDe, solId, URGENCIA } from "./util";

const BOTON_PRIMARIO = "w-full min-h-[56px] rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold inline-flex items-center justify-center gap-2 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer";

function Prioridad({ valor, onCambio }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Prioridad">
      {["BAJA", "MEDIA", "ALTA"].map((p) => (
        <button key={p} type="button" role="radio" aria-checked={valor === p} onClick={() => onCambio(p)} className={`min-h-[52px] rounded-2xl border-2 text-[15px] font-extrabold cursor-pointer transition-colors ${valor === p ? URGENCIA[p].activa : "border-white/[0.08] bg-[#17171c] text-zinc-400"}`}>
          {URGENCIA[p].texto}
        </button>
      ))}
    </div>
  );
}

/** Cantidad con − / + grandes (para usar con el dedo) y atajos. */
function Cantidad({ valor, onCambio, max, atajos = [10, 50, 100] }) {
  const n = Number(valor) || 0;
  const poner = (v) => onCambio(String(Math.max(0, max != null ? Math.min(max, v) : v)));
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => poner(n - 1)} aria-label="Restar uno" className="w-14 min-h-[56px] rounded-2xl bg-white/[0.07] text-zinc-200 grid place-items-center active:bg-white/[0.15] cursor-pointer"><Minus size={22} /></button>
        <input type="number" inputMode="numeric" min="1" max={max} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder="0" className="flex-1 min-w-0 min-h-[56px] rounded-2xl bg-[#17171c] border border-white/[0.1] text-center text-3xl font-extrabold text-white tabular-nums focus:outline-none focus:border-[#FF5A00]/70" />
        <button type="button" onClick={() => poner(n + 1)} aria-label="Sumar uno" className="w-14 min-h-[56px] rounded-2xl bg-white/[0.07] text-[#FFD60A] grid place-items-center active:bg-white/[0.15] cursor-pointer"><Plus size={22} /></button>
      </div>
      {atajos.length > 0 && (
        <div className="mt-2 flex gap-2 flex-wrap">
          {atajos.map((a) => (
            <button key={a} type="button" onClick={() => poner(n + a)} className="min-h-[40px] px-4 rounded-full border border-white/[0.09] bg-white/[0.04] text-sm font-bold text-zinc-300 hover:bg-white/[0.09] cursor-pointer">+{a}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Destino({ valor, onCambio }) {
  return (
    <Campo etiqueta="Destino / motivo" derecha={<span className="text-[11px] font-bold text-zinc-600">{valor.length}/20</span>}>
      <input type="text" maxLength={20} value={valor} onChange={(e) => onCambio(e.target.value.slice(0, 20))} placeholder="Ej: OP 1500, Stock…" className={`${inputCls} uppercase tracking-wide`} />
      <div className="mt-2 flex gap-2 flex-wrap">
        {["STOCK", "REPOSICIÓN"].map((c) => (
          <button key={c} type="button" onClick={() => onCambio(c)} className="min-h-[36px] px-3.5 rounded-full border border-white/[0.09] bg-white/[0.04] text-[13px] font-bold text-zinc-400 hover:text-white cursor-pointer">{c}</button>
        ))}
      </div>
    </Campo>
  );
}

/* ----------------------------------------------------------------- Nueva */
export function NuevaSolicitud({ abierto, onCerrar, semielaborados, activas, onCrear, ocupado }) {
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [urgencia, setUrgencia] = useState("MEDIA");
  const [motivo, setMotivo] = useState("");

  const resultados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (t.length < 2) return [];
    return semielaborados.filter((s) => `${s.codigo || ""} ${s.nombre || ""}`.toLowerCase().includes(t)).slice(0, 8);
  }, [texto, semielaborados]);

  const duplicada = elegido && activas.some((s) => s.semielaboradoCodigo === (elegido.codigo || "S/C"));
  const listo = elegido && Number(cantidad) > 0 && motivo.trim() && !duplicada;

  const enviar = async (e) => {
    e.preventDefault();
    if (!listo) return;
    const ok = await onCrear({ semi: elegido, cantidad: Number(cantidad), urgencia, motivo: motivo.trim().slice(0, 20).toUpperCase() });
    if (ok) {
      setTexto(""); setElegido(null); setCantidad(""); setUrgencia("MEDIA"); setMotivo("");
    }
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva solicitud"
      subtitulo="Pedile a producción lo que necesitás."
      ancho="max-w-xl"
      pie={
        <button type="submit" form="form-nueva" disabled={!listo || ocupado} className={BOTON_PRIMARIO}>
          Enviar solicitud <ChevronRight size={20} strokeWidth={3} />
        </button>
      }
    >
      <form id="form-nueva" onSubmit={enviar} className="flex flex-col gap-6">
        <Campo etiqueta="1 · ¿Qué necesitás?">
          {elegido ? (
            <div className="flex items-center gap-3 rounded-2xl border border-[#FF5A00]/40 bg-[#FF5A00]/[0.07] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-white truncate">{elegido.nombre}</p>
                <p className="font-mono text-xs font-bold text-[#ff8a4d]">{elegido.codigo}</p>
              </div>
              <button type="button" onClick={() => { setElegido(null); setTexto(""); }} aria-label="Cambiar semielaborado" className="w-10 h-10 rounded-xl grid place-items-center text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={18} /></button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscá por código o nombre…" autoComplete="off" className={`${inputCls} pl-11`} />
              </div>
              {texto.trim().length >= 2 && (
                <ul className="mt-2 rounded-2xl border border-white/[0.08] bg-[#131317] overflow-hidden max-h-64 overflow-y-auto custom-scrollbar">
                  {resultados.length === 0 ? (
                    <li className="px-4 py-4 text-sm text-zinc-500">No encontré nada con “{texto}”.</li>
                  ) : resultados.map((r) => (
                    <li key={r.id ?? r.codigo}>
                      <button type="button" onClick={() => setElegido(r)} className="w-full min-h-[56px] px-4 py-2.5 text-left flex items-center gap-3 border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.05] active:bg-white/[0.09] cursor-pointer">
                        <span className="font-mono text-[11px] font-bold text-[#ff8a4d] bg-[#FF5A00]/10 border border-[#FF5A00]/25 rounded-lg px-2 py-1 shrink-0">{r.codigo}</span>
                        <span className="text-[15px] font-semibold text-zinc-100 truncate">{r.nombre}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {duplicada && <p className="mt-2 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2.5 text-sm font-semibold text-rose-200">Ya hay una solicitud activa para este semielaborado.</p>}
        </Campo>

        <Campo etiqueta="2 · ¿Cuántas unidades?"><Cantidad valor={cantidad} onCambio={setCantidad} /></Campo>
        <Campo etiqueta="3 · Prioridad"><Prioridad valor={urgencia} onCambio={setUrgencia} /></Campo>
        <Destino valor={motivo} onCambio={setMotivo} />
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Editar */
export function EditarSolicitud({ solicitud, onCerrar, onGuardar, ocupado }) {
  return (
    <Modal abierto={!!solicitud} onCerrar={onCerrar} titulo={solicitud ? `Editar ${solId(solicitud)}` : ""} subtitulo={solicitud?.semielaboradoNombre} ancho="max-w-lg">
      {solicitud && <FormEditar key={solicitud.id} s={solicitud} onCerrar={onCerrar} onGuardar={onGuardar} ocupado={ocupado} />}
    </Modal>
  );
}
function FormEditar({ s, onCerrar, onGuardar, ocupado }) {
  const [cantidad, setCantidad] = useState(String(s.cantidadSolicitada));
  const [urgencia, setUrgencia] = useState(s.urgencia || "MEDIA");
  const [motivo, setMotivo] = useState(motivoDe(s));
  const listo = Number(cantidad) > 0 && motivo.trim();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (listo) onGuardar({ cantidad: Number(cantidad), urgencia, motivo: motivo.trim().slice(0, 20).toUpperCase() }); }} className="flex flex-col gap-6">
      <Campo etiqueta="Unidades"><Cantidad valor={cantidad} onCambio={setCantidad} atajos={[]} /></Campo>
      <Campo etiqueta="Prioridad"><Prioridad valor={urgencia} onCambio={setUrgencia} /></Campo>
      <Destino valor={motivo} onCambio={setMotivo} />
      <div className="flex gap-3">
        <button type="button" onClick={onCerrar} className="min-h-[56px] px-6 rounded-2xl text-base font-bold text-zinc-300 hover:bg-white/[0.07] cursor-pointer">Cancelar</button>
        <button type="submit" disabled={!listo || ocupado} className={`${BOTON_PRIMARIO} flex-1`}><Check size={20} strokeWidth={3} /> Guardar cambios</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- Retiro */
export function RetirarSolicitud({ solicitud, onCerrar, onRetirar, ocupado }) {
  return (
    <Modal abierto={!!solicitud} onCerrar={onCerrar} titulo="Retirar productos" subtitulo={solicitud ? `${solId(solicitud)} · ${solicitud.semielaboradoNombre}` : ""} ancho="max-w-lg">
      {solicitud && <FormRetiro key={solicitud.id} s={solicitud} onRetirar={onRetirar} ocupado={ocupado} />}
    </Modal>
  );
}
function FormRetiro({ s, onRetirar, ocupado }) {
  const quedan = Math.max(0, (Number(s.cantidadSolicitada) || 0) - (Number(s.cantidadRetirada) || 0));
  const [cantidad, setCantidad] = useState("");
  const n = Number(cantidad) || 0;
  const valido = n > 0 && n <= quedan;
  const completa = valido && n === quedan;
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-[#FFD60A]/25 bg-[#FFD60A]/[0.06] p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#FFD60A]/80">Disponible para retirar</p>
        <p className="mt-1 text-6xl font-extrabold tabular-nums text-[#FFD60A] leading-none">{quedan}</p>
        <p className="mt-2 text-sm text-zinc-400">ya retiraste {s.cantidadRetirada || 0} de {s.cantidadSolicitada}</p>
      </div>
      <Campo etiqueta="¿Cuántas retirás ahora?">
        <Cantidad valor={cantidad} onCambio={setCantidad} max={quedan} atajos={[]} />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => setCantidad(String(quedan))} className="min-h-[44px] px-5 rounded-full border border-[#FFD60A]/30 bg-[#FFD60A]/10 text-sm font-extrabold text-[#FFD60A] cursor-pointer">Todas ({quedan})</button>
          {quedan > 1 && <button type="button" onClick={() => setCantidad(String(Math.floor(quedan / 2)))} className="min-h-[44px] px-5 rounded-full border border-white/[0.09] bg-white/[0.04] text-sm font-bold text-zinc-300 cursor-pointer">La mitad</button>}
        </div>
        {n > quedan && <p className="mt-2 text-sm font-semibold text-rose-300">No podés retirar más de {quedan}.</p>}
      </Campo>
      <button type="button" disabled={!valido || ocupado} onClick={() => onRetirar(s, n)} className={BOTON_PRIMARIO}>
        <Check size={20} strokeWidth={3} /> {completa ? "Confirmar retiro completo" : "Confirmar retiro parcial"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- Auditoría */
function Paso({ color, titulo, fecha, extra }) {
  if (!fecha) return null;
  return (
    <li className="relative pl-7 pb-6 last:pb-0">
      <span className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#0f0f12] ${color}`} />
      <span className="absolute left-[6px] top-5 bottom-0 w-px bg-white/[0.08] last:hidden" />
      <p className="text-[15px] font-bold text-white">{titulo}</p>
      <p className="text-sm text-zinc-500 tabular-nums">{formatFechaArg(fecha)} · {formatHoraArg(fecha)} hs</p>
      {extra}
    </li>
  );
}
export function AuditoriaSolicitud({ solicitud: s, onCerrar }) {
  return (
    <Modal abierto={!!s} onCerrar={onCerrar} titulo={s ? `Auditoría ${solId(s)}` : ""} subtitulo={s?.semielaboradoNombre} ancho="max-w-md">
      {s && (
        <div className="flex flex-col gap-6">
          <ol>
            <Paso color="bg-zinc-300" titulo="Solicitado" fecha={s.solicitadoAt || s.solicitado_at} extra={motivoDe(s) && <p className="mt-1 text-sm font-semibold uppercase text-[#FFD60A]">Destino: {motivoDe(s)}</p>} />
            <Paso color="bg-[#FF5A00]" titulo="Atendido por producción" fecha={s.atendidoAt || s.atendido_at} />
            <Paso color="bg-[#FFD60A]" titulo="Disponible en depósito" fecha={s.disponibleAt || s.disponible_at} />
            <Paso color={s.estado === "CANCELADO" ? "bg-rose-400" : "bg-emerald-400"} titulo={s.estado === "CANCELADO" ? "Cancelada" : "Entregado completo"} fecha={s.entregadoAt || s.entregado_at} />
          </ol>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500 mb-3">Retiros registrados</p>
            {s.retirosHistorial?.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {s.retirosHistorial.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-base font-extrabold text-emerald-300 tabular-nums">+{r.cantidad} u.</p>
                      <p className="text-xs text-zinc-500 truncate">{r.usuario}</p>
                    </div>
                    <p className="text-sm text-zinc-500 tabular-nums text-right shrink-0">{formatFechaArg(r.fecha)}<br />{formatHoraArg(r.fecha)} hs</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600">Todavía no se retiró nada.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* --------------------------------------------------------------- Opciones */
export function OpcionesSolicitud({ solicitud: s, puedeEditar, puedeCancelar, onCerrar, onAuditoria, onEditar, onCancelar }) {
  const [confirmando, setConfirmando] = useState(false);
  const cerrar = () => { setConfirmando(false); onCerrar(); };
  const fila = "w-full min-h-[60px] rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 flex items-center gap-3.5 text-left text-base font-bold text-zinc-100 hover:bg-white/[0.07] active:bg-white/[0.1] cursor-pointer transition-colors";
  return (
    <Modal abierto={!!s} onCerrar={cerrar} titulo={s ? solId(s) : ""} subtitulo={s?.semielaboradoNombre} ancho="max-w-md">
      {s && (
        <div className="flex flex-col gap-2.5">
          <div className="mb-1"><ChipEstado estado={s.estado} /></div>
          <button type="button" className={fila} onClick={() => { onAuditoria(s); cerrar(); }}><History size={20} className="text-[#FFD60A]" /> Ver auditoría</button>
          {puedeEditar && <button type="button" className={fila} onClick={() => { onEditar(s); cerrar(); }}><Pencil size={20} className="text-[#FF5A00]" /> Editar solicitud</button>}
          {puedeCancelar && (confirmando ? (
            <div className="rounded-2xl border border-rose-500/35 bg-rose-500/[0.08] p-4">
              <p className="text-[15px] font-semibold text-rose-100">¿Cancelar {solId(s)}? No se puede deshacer.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { onCancelar(s); cerrar(); }} className="flex-1 min-h-[52px] rounded-2xl bg-rose-500 text-white font-extrabold cursor-pointer">Sí, cancelar</button>
                <button type="button" onClick={() => setConfirmando(false)} className="min-h-[52px] px-5 rounded-2xl text-zinc-300 font-bold hover:bg-white/[0.07] cursor-pointer">No</button>
              </div>
            </div>
          ) : (
            <button type="button" className={`${fila} !text-rose-300 !border-rose-500/20`} onClick={() => setConfirmando(true)}><Ban size={20} /> Cancelar solicitud</button>
          ))}
        </div>
      )}
    </Modal>
  );
}

