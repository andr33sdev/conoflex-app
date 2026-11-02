import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, Send } from "lucide-react";
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

const EASE = [0.22, 1, 0.36, 1];
// Cada pregunta entra desde el lado hacia el que se avanza y la anterior sale hacia el otro.
const variantes = {
  entra: (dir) => ({ opacity: 0, x: dir * 64, scale: 0.985, filter: "blur(6px)" }),
  queda: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.38, ease: EASE } },
  sale: (dir) => ({ opacity: 0, x: dir * -64, scale: 0.985, filter: "blur(6px)", transition: { duration: 0.24, ease: EASE } }),
};

const campoTexto = "w-full min-h-[64px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-xl font-bold text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#FF5A00]";

// Dos botones grandes: "sí, es lo que se indicó" / "no, cambiar".
function SiNo({ si, no, cambiando, onSi, onNo }) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup">
      <button type="button" role="radio" aria-checked={!cambiando} onClick={onSi} className={`min-h-[68px] rounded-2xl border-2 text-lg font-extrabold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors ${!cambiando ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/[0.1] bg-[#17171c] text-zinc-400"}`}>
        <Check size={22} strokeWidth={3} /> {si}
      </button>
      <button type="button" role="radio" aria-checked={cambiando} onClick={onNo} className={`min-h-[68px] rounded-2xl border-2 text-lg font-extrabold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors ${cambiando ? "border-[#FFD60A] bg-[#FFD60A]/12 text-[#FFD60A]" : "border-white/[0.1] bg-[#17171c] text-zinc-400"}`}>
        <Pencil size={20} /> {no}
      </button>
    </div>
  );
}

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
  const kgOriginal = useState(f.kg)[0];
  const [kgCambia, setKgCambia] = useState(false);
  const [materialCambia, setMaterialCambia] = useState(false);
  const [otroNombre, setOtroNombre] = useState(false);
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: typeof v === "string" ? v : v.target.value }));

  // Una pregunta por pantalla. Los ciclos solo existen en rotomoldeo.
  const pasos = ["material", ...(a.es_roto ? ["ciclos"] : []), "buenas", "fallas", "kg", "operario"];
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const paso = pasos[i];
  const ultimo = i === pasos.length - 1;

  const buenas = aNumero(f.buenas);
  const fallas = f.fallas === "" ? 0 : aNumero(f.fallas);
  const total = buenas + fallas;
  const errores = {};
  if (f.buenas === "" || !Number.isInteger(buenas) || buenas < 0) errores.buenas = "Poné cuántas piezas buenas salieron.";
  if (!Number.isInteger(fallas) || fallas < 0) errores.fallas = "Tiene que ser un número entero.";
  if (!errores.buenas && !errores.fallas && total <= 0) errores.fallas = "Poné las piezas buenas o las fallas.";
  if (a.es_roto && f.ciclos !== "" && !Number.isInteger(aNumero(f.ciclos))) errores.ciclos = "Tiene que ser un número entero.";
  if (f.kg !== "" && !(aNumero(f.kg) >= 0)) errores.kg = "Número no válido.";
  if (!f.operario.trim()) errores.operario = "Elegí quién carga.";

  // Qué se valida al apretar "Siguiente" en cada pregunta.
  const errorDelPaso = () => {
    if (paso === "material" && conFormula) {
      const v = lineasParaEnviar(lineas);
      return v.error || null;
    }
    if (paso === "ciclos") return errores.ciclos || null;
    if (paso === "buenas") return errores.buenas || null;
    if (paso === "fallas") return errores.fallas || null;
    if (paso === "kg") return errores.kg || null;
    if (paso === "operario") return errores.operario || null;
    return null;
  };

  const ir = (n) => {
    setDir(n > i ? 1 : -1);
    setIntento(false);
    setI(n);
  };

  const enviar = async () => {
    let formula = null;
    if (conFormula) {
      const v = lineasParaEnviar(lineas);
      if (v.error) return toast(v.error, "error");
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

  const siguiente = () => {
    const e = errorDelPaso();
    if (e) {
      setIntento(true);
      if (paso === "material") toast(e, "error");
      return;
    }
    if (ultimo) return enviar();
    ir(i + 1);
  };

  const err = (k) => (intento ? errores[k] : undefined);
  const nombres = [...new Set([a.operario, ...operarios].filter(Boolean))];
  const kgFormula = a.formula && !a.formula.con_tachada; // rotomoldeo: el kg por pieza sale de la fórmula

  const titulos = {
    material: conFormula ? "¿Usaron la receta indicada?" : "¿Usaron el material indicado?",
    ciclos: "¿Cuántos ciclos hicieron?",
    buenas: "¿Cuántas piezas buenas salieron?",
    fallas: "¿Cuántas fallas hubo?",
    kg: kgFormula ? "¿Cuánto lleva cada pieza?" : "¿Cuánto pesa cada pieza?",
    operario: "¿Quién carga la producción?",
  };

  const pregunta = {
    material: conFormula ? (
      <FormulaUsada lineas={lineas} setLineas={setLineas} original={a.formula?.lineas} version={a.receta_version} porTachada={a.formula ? a.formula.con_tachada : true} onTotal={kgFormula ? (t) => set("kg")(String(t).replace(".", ",")) : undefined} />
    ) : (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-center">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">Material indicado</p>
          <p className="mt-1 text-3xl font-extrabold text-white break-words">{a.receta[0]?.nombre || a.receta[0]?.codigo || f.material || "—"}</p>
          {a.receta[0]?.codigo && a.receta[0]?.nombre && <p className="text-sm text-zinc-500">{a.receta[0].codigo}</p>}
        </div>
        <SiNo si="Sí, ese" no="No, otro" cambiando={materialCambia} onSi={() => { setMaterialCambia(false); set("material")(a.receta[0]?.codigo || f.material); }} onNo={() => setMaterialCambia(true)} />
        {materialCambia && (
          <div>
            <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Código del material usado</span>
            <input value={f.material} onChange={set("material")} placeholder="Ej: PE-NAT" maxLength={255} className={campoTexto} />
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
    ),
    ciclos: <CampoNumero etiqueta="Ciclos" valor={f.ciclos} onChange={set("ciclos")} error={err("ciclos")} autoFocus />,
    buenas: <CampoNumero etiqueta="Piezas buenas" valor={f.buenas} onChange={set("buenas")} error={err("buenas")} ayuda={`Se pidieron ${num(a.cantidad)}`} autoFocus />,
    fallas: <CampoNumero etiqueta="Fallas" valor={f.fallas} onChange={set("fallas")} error={err("fallas")} ayuda="Dejá en 0 si no hubo" autoFocus />,
    kg: (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-center">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">{kgFormula ? "Según la fórmula usada" : "Indicado en la ingeniería"}</p>
          <p className="mt-1 text-5xl font-extrabold text-white tabular-nums">{f.kg || "0"}<span className="text-2xl text-zinc-500"> kg</span></p>
        </div>
        <SiNo
          si="Sí, es ese"
          no="No, cambiar"
          cambiando={kgCambia}
          onSi={() => {
            setKgCambia(false);
            // En rotomoldeo el valor indicado es la suma de la fórmula usada; en inyección, el peso de la ingeniería.
            set("kg")(kgFormula ? String(Math.round(lineas.reduce((t, l) => t + (aNumero(l.kg) || 0), 0) * 1e4) / 1e4).replace(".", ",") : kgOriginal);
          }}
          onNo={() => setKgCambia(true)}
        />
        {kgCambia && <CampoNumero etiqueta="Kg por producto" valor={f.kg} onChange={set("kg")} decimal paso={0.1} error={err("kg")} sufijo="kg" autoFocus />}
        <label className="block">
          <span className="block text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400 mb-2">Color</span>
          <input value={f.color} onChange={set("color")} placeholder="Ej: Naranja" maxLength={100} className={campoTexto} />
        </label>
      </div>
    ),
    operario: (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-center">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">Carga</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{f.operario || "—"}</p>
        </div>
        <SiNo si="Sí, soy yo" no="No soy yo" cambiando={otroNombre} onSi={() => setOtroNombre(false)} onNo={() => setOtroNombre(true)} />
        {otroNombre && (
          <div className="flex flex-wrap gap-2">
            {nombres.map((o) => (
              <button key={o} type="button" onClick={() => { set("operario")(o); setOtroNombre(false); }} className={`min-h-[52px] px-5 rounded-2xl text-base font-bold border transition-colors cursor-pointer ${f.operario === o ? "bg-[#FF5A00] text-black border-[#FF5A00]" : "bg-[#17171c] text-zinc-200 border-white/[0.1] hover:border-white/30"}`}>
                {o}
              </button>
            ))}
          </div>
        )}
        {err("operario") && <p className="text-sm font-semibold text-rose-300">{errores.operario}</p>}
      </div>
    ),
  };

  return (
    <>
      <div className="min-h-full flex flex-col" onKeyDown={(e) => e.key === "Enter" && e.target.tagName === "INPUT" && (e.preventDefault(), siguiente())}>
        <div className="shrink-0" aria-hidden="true">
          <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <motion.div className="h-full rounded-full bg-[#FFD60A]" initial={false} animate={{ width: `${((i + 1) / pasos.length) * 100}%` }} transition={{ duration: 0.45, ease: EASE }} />
          </div>
          <p className="mt-2 text-[13px] font-bold tracking-wide text-zinc-500">Paso {i + 1} de {pasos.length}</p>
        </div>

        <div className="flex-1 flex flex-col justify-center py-6">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={paso} custom={dir} variants={variantes} initial="entra" animate="queda" exit="sale">
              <h3 className="mb-6 text-[28px] sm:text-[32px] leading-tight font-extrabold text-white text-balance">{titulos[paso]}</h3>
              {pregunta[paso]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="sticky bottom-[-1.25rem] -mx-5 sm:-mx-6 -mb-5 mt-2 px-5 sm:px-6 pt-4 pb-5 bg-[#0d0d10] border-t border-white/[0.07] z-[5] flex gap-3">
        {i > 0 && (
          <button type="button" onClick={() => ir(i - 1)} disabled={enviando} aria-label="Volver a la pregunta anterior" className="min-h-[72px] w-[88px] shrink-0 rounded-2xl bg-white/[0.07] text-zinc-200 grid place-items-center hover:bg-white/[0.12] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer">
            <ArrowLeft size={26} />
          </button>
        )}
        <button onClick={siguiente} disabled={enviando} className="flex-1 min-h-[72px] rounded-2xl bg-[#FFD60A] text-black text-2xl font-extrabold inline-flex items-center justify-center gap-3 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
          {enviando ? <Loader2 className="animate-spin" size={26} /> : ultimo ? <Send size={24} /> : null}
          {ultimo ? (previa ? "Guardar los cambios" : "Enviar") : "Siguiente"}
          {!ultimo && !enviando && <ArrowRight size={26} />}
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
