import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Send } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { api, num } from "../produccion/util";
import CampoNumero from "./CampoNumero";
import FormulaUsada from "./FormulaUsada";
import { lineasIniciales, lineasParaEnviar } from "./formula";

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

function Cuerpo({ a, operarios, onCerrar, onGuardado, toast }) {
  const previa = a.carga && a.carga.estado === "PENDIENTE" ? a.carga : null;
  const mem = leerMemoria()[a.modelo_codigo] || {};
  const [f, setF] = useState({
    operario: previa?.operario || a.operario || "",
    ciclos: previa ? String(previa.ciclos || "") : "",
    buenas: previa ? String(previa.total_producido - previa.fallas) : "",
    fallas: previa ? String(previa.fallas) : "",
    kg: previa ? String(previa.kg_por_producto || "") : a.formula?.peso ? String(a.formula.peso) : mem.kg || "",
    color: previa?.color ?? mem.color ?? "",
    material: previa?.codigo_material ?? mem.material ?? (a.receta[0]?.codigo || ""),
  });
  const [lineas, setLineas] = useState(() => lineasIniciales(previa?.formula_usada?.lineas?.length ? previa.formula_usada.lineas : a.formula?.lineas));
  const conFormula = !!a.formula || lineas.length > 0;
  const conocido = !!previa || !!(mem.kg && mem.color);
  const [masDatos, setMasDatos] = useState(!conocido);
  const [otroNombre, setOtroNombre] = useState(false);
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value }));

  const buenas = aNumero(f.buenas);
  const fallas = f.fallas === "" ? 0 : aNumero(f.fallas);
  const total = buenas + fallas;
  const errores = {};
  if (f.buenas === "" || !Number.isInteger(buenas) || buenas < 0) errores.buenas = "Poné cuántas piezas buenas salieron.";
  if (!Number.isInteger(fallas) || fallas < 0) errores.fallas = "Tiene que ser un número entero.";
  if (!errores.buenas && !errores.fallas && total <= 0) errores.buenas = "Poné las piezas buenas o las fallas.";
  if (a.es_roto && f.ciclos !== "" && !Number.isInteger(aNumero(f.ciclos))) errores.ciclos = "Tiene que ser un número entero.";
  if (f.kg !== "" && !(aNumero(f.kg) >= 0)) errores.kg = "Número no válido.";

  const enviar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) {
      if (errores.ciclos || errores.kg) setMasDatos(true);
      return;
    }
    let formula = null;
    if (conFormula) {
      const v = lineasParaEnviar(lineas);
      if (v.error) {
        toast(v.error, "error");
        return;
      }
      formula = { lineas: v.lineas };
    }
    setEnviando(true);
    const body = {
      asignacion_id: a.id,
      operario: f.operario,
      ciclos: !a.es_roto || f.ciclos === "" ? 0 : aNumero(f.ciclos),
      total_producido: total,
      fallas,
      kg_por_producto: f.kg === "" ? 0 : aNumero(f.kg),
      color: f.color,
      codigo_material: conFormula ? lineas.map((l) => l.codigo).join(" + ") : f.material,
      formula_usada: formula,
      observaciones: previa?.observaciones || "",
    };
    try {
      if (previa) await api(`/api/prod/cargas/${previa.id}`, { method: "PUT", body });
      else await api("/api/prod/cargas", { method: "POST", body });
      guardarMemoria(a.modelo_codigo, { kg: f.kg, color: f.color, material: f.material });
      setHecho(true);
      setTimeout(() => {
        onGuardado();
        onCerrar();
      }, 1400);
    } catch (e) {
      toast(e.message, "error");
      setEnviando(false);
    }
  };

  const err = (k) => (intento ? errores[k] : undefined);
  const nombres = [...new Set([a.operario, ...operarios].filter(Boolean))];

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoNumero etiqueta="Piezas buenas" valor={f.buenas} onChange={set("buenas")} error={err("buenas")} ayuda={`Se pidieron ${num(a.cantidad)}`} autoFocus />
          <CampoNumero etiqueta="Fallas" valor={f.fallas} onChange={set("fallas")} error={err("fallas")} ayuda="Dejá en 0 si no hubo" />
        </div>

        {a.es_roto && <CampoNumero etiqueta="Ciclos" valor={f.ciclos} onChange={set("ciclos")} error={err("ciclos")} />}

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex items-center gap-3">
            <p className="flex-1 min-w-0 text-base text-zinc-300 truncate">
              {!conFormula && (
                <>
                  <span className="text-zinc-500">Material </span><b className="text-white">{f.material || "—"}</b>
                  <span className="text-zinc-500"> · </span>
                </>
              )}
              <span className="text-zinc-500">Color </span><b className="text-white">{f.color || "—"}</b>
              <span className="text-zinc-500"> · </span><b className="text-white">{f.kg || "0"} kg</b>
            </p>
            <button type="button" onClick={() => setMasDatos((v) => !v)} className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] text-sm font-bold text-zinc-200 hover:bg-white/[0.12] cursor-pointer">
              {masDatos ? "Listo" : "Cambiar"}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {masDatos && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid gap-4 sm:grid-cols-2 pt-4">
                  <CampoNumero etiqueta="Kg por producto" valor={f.kg} onChange={set("kg")} decimal paso={0.1} error={err("kg")} sufijo="kg" />
                  <label className="block">
                    <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Color</span>
                    <input value={f.color} onChange={set("color")} placeholder="Ej: Naranja" maxLength={100} className="w-full min-h-[64px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-xl font-bold text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF5A00]" />
                  </label>
                  {!conFormula && (
                  <div className="sm:col-span-2">
                      <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Código del material</span>
                      <input value={f.material} onChange={set("material")} placeholder="Ej: PE-NAT" maxLength={255} className="w-full min-h-[64px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-xl font-bold text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF5A00]" />
                      {a.receta.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {a.receta.map((r) => (
                            <button key={r.codigo} type="button" onClick={() => set("material")(r.codigo)} className={`min-h-[44px] px-4 rounded-xl text-sm font-bold border cursor-pointer transition-colors ${f.material === r.codigo ? "bg-white/[0.14] border-white/30 text-white" : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"}`}>
                              {r.codigo}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
  
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {conFormula && <FormulaUsada lineas={lineas} setLineas={setLineas} original={a.formula?.lineas} />}

        <div className="flex flex-wrap items-center gap-3 text-base">
          <span className="text-zinc-500">Carga:</span>
          <b className="text-white">{f.operario || "—"}</b>
          <button type="button" onClick={() => setOtroNombre((v) => !v)} className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] text-sm font-bold text-zinc-200 hover:bg-white/[0.12] cursor-pointer">
            {otroNombre ? "Listo" : "No soy yo"}
          </button>
        </div>
        {otroNombre && (
          <div className="flex flex-wrap gap-2 -mt-2">
            {nombres.map((o) => (
              <button key={o} type="button" onClick={() => { set("operario")(o); setOtroNombre(false); }} className={`min-h-[52px] px-5 rounded-2xl text-base font-bold border transition-colors cursor-pointer ${f.operario === o ? "bg-[#FF5A00] text-black border-[#FF5A00]" : "bg-[#17171c] text-zinc-200 border-white/[0.1] hover:border-white/30"}`}>
                {o}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-[-1.25rem] -mx-5 sm:-mx-6 -mb-5 mt-6 px-5 sm:px-6 pt-4 pb-5 bg-[#0d0d10] border-t border-white/[0.07] z-[5]">
        <button onClick={enviar} disabled={enviando} className="w-full min-h-[72px] rounded-2xl bg-[#FFD60A] text-black text-2xl font-extrabold inline-flex items-center justify-center gap-3 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
          {enviando ? <Loader2 className="animate-spin" size={26} /> : <Send size={24} />}
          {previa ? "Guardar los cambios" : "Enviar"}
        </button>
      </div>

      <AnimatePresence>
        {hecho && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[130] grid place-items-center bg-[#0d0d10]/95 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="text-center px-6">
              <span className="mx-auto w-24 h-24 rounded-full grid place-items-center bg-emerald-500/15 border-2 border-emerald-400 text-emerald-300">
                <Check size={52} strokeWidth={3} />
              </span>
              <p className="mt-5 text-3xl font-extrabold text-white">¡Listo, enviado!</p>
              <p className="mt-2 text-lg text-zinc-400">{num(buenas)} piezas buenas · gracias {f.operario.split(" ")[0]}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function FormularioCarga({ asignacion, operarios, onCerrar, onGuardado, toast }) {
  return (
    <Drawer abierto={!!asignacion} onCerrar={onCerrar} titulo={asignacion ? asignacion.maquina || "Sin máquina" : ""} subtitulo={asignacion ? `${asignacion.modelo_nombre} · ${asignacion.lote}` : ""}>
      {asignacion && <Cuerpo key={asignacion.id} a={asignacion} operarios={operarios} onCerrar={onCerrar} onGuardado={onGuardado} toast={toast} />}
    </Drawer>
  );
}
