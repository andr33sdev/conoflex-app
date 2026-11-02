import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Building2, FilePlus2, Loader2 } from "lucide-react";
import { Drawer, Etiqueta } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { formatFechaArg } from "../solicitudes/util";
import { abrev, idSC, nf } from "./util";

const EASE = [0.22, 1, 0.36, 1];

// Se monta de nuevo cada vez que se abre. onAgregar(datos) lanza un error con .status 409 y .datos.pedidos si ya estaba solicitada.
export default function AgregarASolicitud({ abierto, sugerencia: s, solicitudes, proveedores, cargando, onCerrar, onAgregar }) {
  const [sol, setSol] = useState(solicitudes.length === 1 ? solicitudes[0].id : null);
  const [cantidad, setCantidad] = useState(s ? String(Number(s.cantidad)).replace(".", ",") : "");
  const [proveedor, setProveedor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [duplicado, setDuplicado] = useState(null); // pedidos que ya existían sin recibir
  const [intento, setIntento] = useState(false);

  const n = Number(String(cantidad).replace(",", "."));
  const errores = { sol: sol ? "" : "Elegí la solicitud.", cant: n > 0 ? "" : "La cantidad tiene que ser mayor a cero." };
  const cambio = s && n > 0 && Math.abs(n - Number(s.cantidad)) > 1e-9;

  const enviar = async (confirmarDuplicado = false) => {
    setIntento(true);
    if (errores.sol || errores.cant) return;
    setGuardando(true);
    setError("");
    try {
      await onAgregar({ solicitud_id: sol, cantidad: n, proveedor: proveedor.trim(), confirmar_duplicado: confirmarDuplicado });
    } catch (e) {
      if (e.status === 409 && e.datos?.codigo === "YA_SOLICITADO") setDuplicado(e.datos.pedidos || []);
      else setError(e.message || "No se pudo agregar.");
      setGuardando(false);
    }
  };

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Agregar a una solicitud de compra"
      subtitulo={s ? `${s.mp_nombre} · sugerido ${nf(s.cantidad, 3)} ${abrev(s.unidad)}` : ""}
      pie={
        duplicado ? (
          <div className="flex gap-3">
            <button type="button" onClick={() => setDuplicado(null)} className="min-h-[56px] px-5 rounded-2xl text-zinc-200 hover:bg-white/[0.06] font-bold cursor-pointer">Volver</button>
            <button type="button" onClick={() => enviar(true)} disabled={guardando} className="flex-1 min-h-[56px] rounded-2xl bg-[#FF5A00] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2.5 hover:bg-[#ff7a30] active:scale-[0.99] cursor-pointer disabled:opacity-50">
              {guardando ? <Loader2 size={20} className="animate-spin" /> : <FilePlus2 size={20} />} Agregar igual
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>{error && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-sm font-semibold text-rose-300 overflow-hidden">{error}</motion.p>}</AnimatePresence>
            <div className="flex gap-3">
              <button type="button" onClick={onCerrar} className="min-h-[56px] px-5 rounded-2xl text-zinc-300 hover:text-white hover:bg-white/[0.06] font-bold cursor-pointer">Cancelar</button>
              <button type="button" onClick={() => enviar(false)} disabled={guardando || (!cargando && !solicitudes.length)} className="flex-1 min-h-[56px] rounded-2xl bg-[#FFD60A] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2.5 hover:bg-white active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                {guardando ? <Loader2 size={20} className="animate-spin" /> : <FilePlus2 size={20} />} Agregar
              </button>
            </div>
          </div>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {duplicado ? (
          <motion.div key="aviso" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex flex-col gap-4">
            <div className="rounded-3xl border border-amber-500/35 bg-amber-500/[0.08] p-5">
              <p className="flex items-center gap-2.5 text-lg font-extrabold text-amber-200"><AlertTriangle size={22} className="shrink-0" /> Ya se solicitó</p>
              <p className="mt-2 text-[15px] text-amber-100/90 leading-relaxed">{s.mp_nombre} ya fue solicitada y <b>están esperando la recepción</b>. ¿La querés agregar de todas formas?</p>
            </div>
            <ul className="flex flex-col gap-2">
              {duplicado.map((p) => (
                <li key={p.item_id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-white">{idSC(p.solicitud_id)} <span className="font-medium text-zinc-500">· {formatFechaArg(p.fecha)}</span></span>
                    <span className="block text-sm text-zinc-400 truncate">{p.proveedor || "Proveedor sin definir"}</span>
                  </span>
                  <span className="text-right tabular-nums text-sm"><b className="text-white">{nf(p.pedida, 3)}</b> <span className="text-zinc-500">pedidos</span><br /><span className="text-zinc-400">llegaron {nf(p.recibida, 3)}</span></span>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-6">
            <div>
              <Etiqueta>Solicitud abierta</Etiqueta>
              {cargando ? (
                <div className="h-[60px] rounded-2xl bg-white/[0.04] animate-pulse" />
              ) : solicitudes.length ? (
                <div role="radiogroup" aria-label="Solicitud" className="flex flex-col gap-2">
                  {solicitudes.map((x) => {
                    const sel = sol === x.id;
                    return (
                      <button key={x.id} type="button" role="radio" aria-checked={sel} onClick={() => setSol(x.id)} className={`text-left min-h-[60px] px-4 rounded-2xl border flex items-center gap-3 cursor-pointer transition-colors ${sel ? "border-[#FF5A00]/70 bg-[#FF5A00]/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07]"}`}>
                        <span className={`w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 ${sel ? "border-[#FF5A00]" : "border-zinc-600"}`}>{sel && <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A00]" />}</span>
                        <span className="font-extrabold text-white">{idSC(x.id)}</span>
                        <span className="text-sm text-zinc-500">{formatFechaArg(x.fecha)}</span>
                        <span className="ml-auto text-sm font-semibold text-zinc-400">{x.renglones} {x.renglones === 1 ? "renglón" : "renglones"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 text-sm text-zinc-400 leading-relaxed">No hay solicitudes de compra abiertas. Creá una en <b className="text-zinc-200">Solicitudes de Compra</b> y volvé a agregar esta sugerencia.</p>
              )}
              {intento && errores.sol && solicitudes.length > 0 && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.sol}</p>}
            </div>
            <label className="block">
              <Etiqueta>Cantidad a pedir</Etiqueta>
              <div className="relative">
                <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${campo} !min-h-[60px] !text-2xl font-extrabold tabular-nums pr-20`} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">{abrev(s?.unidad)}</span>
              </div>
              <p className={`mt-1.5 text-xs ${cambio ? "text-[#FFD60A]" : "text-zinc-600"}`}>{cambio ? `Cambia lo sugerido (${nf(s.cantidad, 3)}). Queda registrado en la auditoría.` : "Es la cantidad que se sugirió. Podés cambiarla."}</p>
              {intento && errores.cant && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.cant}</p>}
            </label>
            <label className="block">
              <Etiqueta>Proveedor (opcional)</Etiqueta>
              <div className="relative">
                <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input list="sug-proveedores" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Elegí o escribí el proveedor" className={`${campo} pl-10`} />
                <datalist id="sug-proveedores">{proveedores.map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">Si lo dejás vacío queda "A definir" en la solicitud.</p>
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </Drawer>
  );
}
