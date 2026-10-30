import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Send } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { api, diaMes, num, turnoLabel } from "../produccion/util";
import CampoNumero from "./CampoNumero";

// Lo que el operario ya cargó para este modelo se recuerda en la tablet: kg, color y código de material casi no cambian.
const CLAVE = "cf_carga_memoria";
const leerMemoria = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || "{}");
  } catch {
    return {};
  }
};
const guardarMemoria = (codigo, v) => {
  try {
    const m = leerMemoria();
    m[codigo] = v;
    localStorage.setItem(CLAVE, JSON.stringify(m));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
};

const aNumero = (t) => Number(String(t).replace(",", "."));

function Fijo({ t, v }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-500">{t}</span>
      <span className="block mt-0.5 text-lg font-bold text-white truncate">{v}</span>
    </div>
  );
}

function Cuerpo({ a, fecha, operarios, onCerrar, onGuardado, toast }) {
  const previa = a.carga && a.carga.estado === "PENDIENTE" ? a.carga : null;
  const mem = leerMemoria()[a.modelo_codigo] || {};
  const [f, setF] = useState({
    operario: previa?.operario || a.operario || "",
    ciclos: previa ? String(previa.ciclos || "") : "",
    total: previa ? String(previa.total_producido) : "",
    fallas: previa ? String(previa.fallas) : "",
    kg: previa ? String(previa.kg_por_producto || "") : mem.kg || "",
    color: previa?.color ?? mem.color ?? "",
    material: previa?.codigo_material ?? mem.material ?? (a.receta[0]?.codigo || ""),
    obs: previa?.observaciones || "",
  });
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value }));

  const total = aNumero(f.total);
  const fallas = f.fallas === "" ? 0 : aNumero(f.fallas);
  const errores = {};
  if (!(total > 0) || !Number.isInteger(total)) errores.total = "Poné cuántas piezas salieron en total.";
  if (!Number.isInteger(fallas) || fallas < 0) errores.fallas = "Tiene que ser un número entero.";
  else if (total > 0 && fallas > total) errores.fallas = "No pueden ser más que el total.";
  if (f.ciclos !== "" && !Number.isInteger(aNumero(f.ciclos))) errores.ciclos = "Tiene que ser un número entero.";
  if (f.kg !== "" && !(aNumero(f.kg) >= 0)) errores.kg = "Número no válido.";
  if (!f.operario.trim()) errores.operario = "Elegí quién carga.";
  const buenas = total > 0 && fallas >= 0 && fallas <= total ? total - fallas : null;

  const enviar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) return;
    setEnviando(true);
    const body = {
      asignacion_id: a.id,
      operario: f.operario,
      ciclos: f.ciclos === "" ? 0 : aNumero(f.ciclos),
      total_producido: total,
      fallas,
      kg_por_producto: f.kg === "" ? 0 : aNumero(f.kg),
      color: f.color,
      codigo_material: f.material,
      observaciones: f.obs,
    };
    try {
      if (previa) await api(`/api/prod/cargas/${previa.id}`, { method: "PUT", body });
      else await api("/api/prod/cargas", { method: "POST", body });
      guardarMemoria(a.modelo_codigo, { kg: f.kg, color: f.color, material: f.material });
      setHecho(true);
      setTimeout(() => {
        onGuardado();
        onCerrar();
      }, 1500);
    } catch (e) {
      toast(e.message, "error");
      setEnviando(false);
    }
  };

  const err = (k) => (intento ? errores[k] : undefined);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 mb-6">
        <Fijo t="Fecha" v={`${diaMes(fecha)} · ${turnoLabel(a.turno)}`} />
        <Fijo t="Máquina" v={a.maquina || "—"} />
        <Fijo t="Modelo" v={a.modelo_nombre} />
        <Fijo t="Lote" v={a.lote} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Nombre</span>
          <div className="flex flex-wrap gap-2">
            {[...new Set([a.operario, ...operarios].filter(Boolean))].map((o) => (
              <button key={o} type="button" onClick={() => set("operario")(o)} className={`min-h-[52px] px-5 rounded-2xl text-base font-bold border transition-colors cursor-pointer ${f.operario === o ? "bg-[#FF5A00] text-black border-[#FF5A00]" : "bg-[#17171c] text-zinc-200 border-white/[0.1] hover:border-white/30"}`}>
                {o}
              </button>
            ))}
          </div>
          {err("operario") && <p className="mt-1.5 text-sm font-semibold text-rose-300">{err("operario")}</p>}
        </div>

        <CampoNumero etiqueta="Total producido" valor={f.total} onChange={set("total")} error={err("total")} ayuda={`Objetivo del turno: ${num(a.cantidad)} · incluye las piezas falladas`} autoFocus />
        <CampoNumero etiqueta="Fallas" valor={f.fallas} onChange={set("fallas")} error={err("fallas")} ayuda={buenas != null ? `Quedan ${num(buenas)} piezas buenas` : "Piezas descartadas (0 si no hubo)"} />
        <CampoNumero etiqueta="Ciclos" valor={f.ciclos} onChange={set("ciclos")} error={err("ciclos")} />
        <CampoNumero etiqueta="Kg por producto" valor={f.kg} onChange={set("kg")} decimal paso={0.1} error={err("kg")} sufijo="kg" />

        <label className="block">
          <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Color</span>
          <input value={f.color} onChange={set("color")} placeholder="Ej: Naranja" maxLength={100} className="w-full min-h-[64px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-xl font-bold text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF5A00]" />
        </label>
        <div>
          <label className="block">
            <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Código del material</span>
            <input value={f.material} onChange={set("material")} placeholder="Ej: PE-NAT" maxLength={255} className="w-full min-h-[64px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-xl font-bold text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF5A00]" />
          </label>
          {a.receta.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {a.receta.map((r) => (
                <button key={r.codigo} type="button" onClick={() => set("material")(r.codigo)} className={`min-h-[40px] px-3 rounded-xl text-sm font-bold border cursor-pointer transition-colors ${f.material === r.codigo ? "bg-white/[0.14] border-white/30 text-white" : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"}`}>
                  {r.codigo}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="block sm:col-span-2">
          <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Observaciones (opcional)</span>
          <textarea value={f.obs} onChange={set("obs")} rows={2} maxLength={2000} placeholder="Algo que tenga que saber el jefe de producción" className="w-full rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 py-3 text-lg text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF5A00] resize-none" />
        </label>
      </div>

      <div className="sticky bottom-0 -mx-5 sm:-mx-6 -mb-5 mt-6 px-5 sm:px-6 pt-4 pb-5 bg-[#0d0d10] border-t border-white/[0.07] z-[5]">
        <button onClick={enviar} disabled={enviando} className="w-full min-h-[68px] rounded-2xl bg-[#FFD60A] text-black text-xl font-extrabold inline-flex items-center justify-center gap-3 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
          {enviando ? <Loader2 className="animate-spin" size={24} /> : <Send size={22} />}
          {previa ? "Guardar los cambios" : "Enviar producción"}
        </button>
      </div>

      <AnimatePresence>
        {hecho && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[130] grid place-items-center bg-[#0d0d10]/95 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="text-center px-6">
              <span className="mx-auto w-24 h-24 rounded-full grid place-items-center bg-emerald-500/15 border-2 border-emerald-400 text-emerald-300">
                <Check size={52} strokeWidth={3} />
              </span>
              <p className="mt-5 text-3xl font-extrabold text-white">¡Producción enviada!</p>
              <p className="mt-2 text-lg text-zinc-400">{num(buenas ?? total)} piezas buenas · gracias {f.operario.split(" ")[0]}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function FormularioCarga({ asignacion, fecha, operarios, onCerrar, onGuardado, toast }) {
  return (
    <Drawer abierto={!!asignacion} onCerrar={onCerrar} titulo={asignacion ? `Cargar producción · ${asignacion.maquina || "Sin máquina"}` : ""} subtitulo={asignacion ? `${asignacion.modelo_nombre} · ${asignacion.lote}` : ""}>
      {asignacion && <Cuerpo key={asignacion.id} a={asignacion} fecha={fecha} operarios={operarios} onCerrar={onCerrar} onGuardado={onGuardado} toast={toast} />}
    </Drawer>
  );
}
