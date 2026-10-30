import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { api } from "../produccion/util";
import { BarraComposicion } from "./Receta";
import { COLORES, aNum, conPct, kgLindo, nf, norm } from "./formato";

const campo = "w-full min-h-[48px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70";
const MAX_RESULTADOS = 8;

const PROCESOS = [
  { id: "INYECCION", nombre: "Inyección", nota: "Receta por tachada" },
  { id: "ROTOMOLDEO", nombre: "Rotomoldeo", nota: "Lleva ciclos" },
  { id: "EXTRUSION", nombre: "Extrusión", nota: "Receta por pieza" },
];

function Cuerpo({ parent, receta, cantidadRecetas, materias, semis, procesoSugerido, onCerrar, onGuardado, toast }) {
  const esSE = parent.type === "SE";
  const ings = receta?.ingredientes || [];
  const sinTachada = esSE && ings.some((i) => i.item_type === "MP" && i.cantidad_tachada == null);
  const pesoInicial = receta?.peso_pieza_kg != null ? Number(receta.peso_pieza_kg) : sinTachada ? Math.round(ings.filter((i) => i.item_type === "MP").reduce((a, i) => a + Number(i.cantidad), 0) * 1e4) / 1e4 : "";

  const [nombre, setNombre] = useState(receta?.nombre_version || `Receta v${cantidadRecetas + 1}`);
  const [proceso, setProceso] = useState(esSE ? receta?.proceso || procesoSugerido || "" : "");
  const [activa, setActiva] = useState(receta ? !!receta.es_activa : cantidadRecetas === 0);
  const [peso, setPeso] = useState(pesoInicial === "" ? "" : String(pesoInicial));
  const [filas, setFilas] = useState(() =>
    ings.map((i) => ({
      tipo: i.item_type,
      id: i.item_type === "MP" ? i.materia_prima_id : i.semielaborado_id,
      codigo: i.item_codigo,
      nombre: i.item_nombre,
      valor: String(i.item_type === "MP" && esSE ? (i.cantidad_tachada != null ? i.cantidad_tachada : i.cantidad) : i.cantidad),
      unidad: "kg",
      unidad_medida: i.unidad_medida,
    })),
  );
  const [catalogo, setCatalogo] = useState("MP");
  const [buscar, setBuscar] = useState("");
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // En el semielaborado los materiales van en kg (o g); solo la inyección los define por tachada.
  const enKg = (f) => esSE && f.tipo === "MP";
  const enTachada = (f) => enKg(f) && proceso === "INYECCION";
  const convertida = proceso === "INYECCION" && sinTachada;
  const kgDe = (f) => aNum(f.valor) / (f.unidad === "g" ? 1000 : 1);
  const tachada = filas.filter(enTachada);
  const lineas = tachada.map((f) => ({ mp_id: f.id, nombre: f.nombre, codigo: f.codigo, kg_tachada: kgDe(f) || 0 }));
  const total = lineas.reduce((a, l) => a + l.kg_tachada, 0);
  const kgPorPieza = filas.filter(enKg).reduce((a, f) => a + (kgDe(f) || 0), 0);
  const pesoNum = aNum(peso);
  const pct = conPct(lineas);

  const errores = {};
  if (!nombre.trim()) errores.nombre = "Poné un nombre para la receta.";
  if (esSE && !proceso) errores.proceso = "Elegí en qué máquina se hace.";
  if (!filas.length) errores.filas = "Agregá al menos un material.";
  if (tachada.length && !(pesoNum > 0)) errores.peso = "Poné cuánto pesa la pieza para calcular lo de cada material.";
  const filaMala = filas.find((f) => !(enKg(f) ? kgDe(f) : aNum(f.valor)) > 0);
  if (filaMala) errores.filas = `Poné una cantidad mayor a cero en ${filaMala.nombre}.`;

  const resultados = useMemo(() => {
    const fuente = catalogo === "MP" ? materias : semis.filter((s) => !(esSE && s.id === parent.id));
    const t = norm(buscar).trim();
    const puestos = new Set(filas.filter((f) => f.tipo === catalogo).map((f) => f.id));
    return fuente.filter((x) => !puestos.has(x.id) && (!t || norm(`${x.codigo} ${x.nombre}`).includes(t)));
  }, [catalogo, buscar, materias, semis, filas, esSE, parent.id]);

  const agregar = (x) => {
    setFilas((fs) => [...fs, { tipo: catalogo, id: x.id, codigo: x.codigo, nombre: x.nombre, valor: "", unidad: "kg", unidad_medida: x.unidad_medida || (catalogo === "MP" ? "Kg" : "Unidades") }]);
    setBuscar("");
  };
  const cambiar = (idx, parte) => setFilas((fs) => fs.map((f, i) => (i === idx ? { ...f, ...parte } : f)));

  const guardar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) return;
    setGuardando(true);
    const body = {
      parent_id: parent.id,
      parent_type: parent.type,
      nombre_version: nombre.trim(),
      es_activa: activa,
      proceso: esSE ? proceso : undefined,
      peso_pieza_kg: tachada.length ? pesoNum : esSE && kgPorPieza > 0 ? Math.round(kgPorPieza * 1e6) / 1e6 : undefined,
      ingredientes: filas.map((f) =>
        f.tipo === "MP"
          ? enTachada(f)
            ? { materia_prima_id: f.id, cantidad_tachada: kgDe(f), unidad_medida: "Kg" }
            : enKg(f)
              ? { materia_prima_id: f.id, cantidad: kgDe(f), unidad_medida: "Kg" }
              : { materia_prima_id: f.id, cantidad: aNum(f.valor), unidad_medida: f.unidad_medida || "Kg" }
          : { semielaborado_id: f.id, cantidad: aNum(f.valor), unidad_medida: f.unidad_medida || "Unidades" },
      ),
    };
    try {
      await api(receta ? `/api/ingenierias/${receta.id}` : "/api/ingenierias", { method: receta ? "PUT" : "POST", body });
      onGuardado(!receta, nombre.trim());
    } catch (e) {
      toast(e.message, "error");
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {convertida && (
          <div className="rounded-2xl border border-[#FFD60A]/30 bg-[#FFD60A]/[0.07] p-4 text-sm text-[#ffe98a] flex gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>Esta receta estaba cargada por pieza. La pasé a fórmula con las mismas proporciones: poné los kg reales de tu tachada y el peso de la pieza.</p>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em] text-zinc-400 mb-2">Nombre de la receta</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={`${campo} ${intento && errores.nombre ? "border-rose-500/70" : ""}`} />
            {intento && errores.nombre && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.nombre}</p>}
          </label>
          <button type="button" role="switch" aria-checked={activa} onClick={() => setActiva((v) => !v)} className={`min-h-[48px] px-4 rounded-2xl border inline-flex items-center gap-3 text-sm font-bold cursor-pointer transition-colors ${activa ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-white/[0.1] bg-white/[0.04] text-zinc-400"}`}>
            <span className={`relative w-10 h-6 rounded-full transition-colors ${activa ? "bg-emerald-500" : "bg-zinc-700"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${activa ? "left-[18px]" : "left-0.5"}`} />
            </span>
            Activa en planta
          </button>
        </section>

        {esSE && (
          <section>
            <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em] text-zinc-400 mb-2">¿En qué máquina se hace?</span>
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Proceso de fabricación">
              {PROCESOS.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={proceso === x.id} onClick={() => setProceso(x.id)} className={`min-h-[68px] rounded-2xl border px-2 py-2.5 text-center cursor-pointer transition-colors ${proceso === x.id ? "border-[#FF5A00] bg-[#FF5A00]/15 text-white" : "border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:text-white"} ${intento && errores.proceso ? "border-rose-500/70" : ""}`}>
                  <span className="block text-[15px] font-extrabold leading-tight">{x.nombre}</span>
                  <span className="block text-[11px] font-semibold mt-0.5 opacity-70">{x.nota}</span>
                </button>
              ))}
            </div>
            {intento && errores.proceso && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.proceso}</p>}
          </section>
        )}

        {esSE && proceso === "INYECCION" && (
          <section>
            <label className="block max-w-xs">
              <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em] text-zinc-400 mb-2">Peso de la pieza</span>
              <div className="relative">
                <input value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Ej: 1,48" className={`${campo} pr-12 ${intento && errores.peso ? "border-rose-500/70" : ""}`} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">kg</span>
              </div>
              {intento && errores.peso && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.peso}</p>}
            </label>
          </section>
        )}

        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base font-extrabold text-white">{proceso === "INYECCION" ? "Fórmula por tachada" : esSE ? "Materiales por pieza" : "Materiales por unidad"}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{proceso === "INYECCION" ? "Cuánto lleva cada material en una tachada. El sistema saca los porcentajes y lo que lleva cada pieza." : esSE ? "Cuánto lleva cada pieza de cada material." : "Cantidad de cada material por cada unidad producida."}</p>
            </div>
            {esSE && proceso !== "INYECCION" && kgPorPieza > 0 && <span className="text-sm font-bold text-zinc-300 shrink-0">Pieza: <b className="text-white">{nf(kgPorPieza, 3)} kg</b></span>}
            {tachada.length > 0 && <span className="text-sm font-bold text-zinc-300 shrink-0">Tachada: <b className="text-white">{nf(total, 3)} kg</b></span>}
          </div>

          {tachada.length > 0 && <div className="mb-4"><BarraComposicion lineas={lineas} alto="h-3" /></div>}

          {filas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.14] px-5 py-8 text-center text-sm text-zinc-500">Todavía no hay materiales. Buscá y agregá abajo.</div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              <AnimatePresence initial={false}>
                {filas.map((f, idx) => {
                  const iT = tachada.findIndex((t) => t.id === f.id && t.tipo === f.tipo);
                  const p = enTachada(f) ? pct[iT] : null;
                  return (
                    <motion.li key={`${f.tipo}-${f.id}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="rounded-2xl border border-white/[0.08] bg-[#111114] p-3.5">
                      <div className="flex items-start gap-3">
                        {p && <span className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: COLORES[iT % COLORES.length] }} />}
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold text-white leading-snug break-words">{f.nombre}</p>
                          <p className="text-xs text-zinc-500">{f.tipo === "SE" ? "Semielaborado · " : ""}{f.codigo}</p>
                        </div>
                        <button type="button" onClick={() => setFilas((fs) => fs.filter((_, i) => i !== idx))} aria-label={`Quitar ${f.nombre}`} className="w-10 h-10 -mr-1 grid place-items-center rounded-xl text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={16} /></button>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <div className="flex items-stretch rounded-xl border border-white/[0.1] bg-[#17171c] overflow-hidden focus-within:border-[#FF5A00]/70">
                          <input value={f.valor} onChange={(e) => cambiar(idx, { valor: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" aria-label={`Cantidad de ${f.nombre}`} placeholder="0" className="w-28 min-h-[46px] bg-transparent px-3 text-lg font-extrabold text-white text-right tabular-nums focus:outline-none" />
                          {enKg(f) ? (
                            <select value={f.unidad} onChange={(e) => cambiar(idx, { unidad: e.target.value })} aria-label="Unidad" className="bg-white/[0.05] border-l border-white/[0.08] px-2 text-sm font-bold text-zinc-200 focus:outline-none cursor-pointer">
                              <option value="kg">kg</option>
                              <option value="g">g</option>
                            </select>
                          ) : (
                            <span className="px-3 grid place-items-center bg-white/[0.05] border-l border-white/[0.08] text-sm font-bold text-zinc-400">{f.tipo === "MP" ? f.unidad_medida || "Kg" : "u."}</span>
                          )}
                        </div>
                        {p && (
                          <p className="text-sm text-zinc-400 tabular-nums">
                            <b className="text-[#ff9a63]">{nf(p.pct, 1)} %</b>
                            {pesoNum > 0 && <> · {kgLindo((pesoNum * p.pct) / 100)} por pieza</>}
                          </p>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          {intento && errores.filas && <p className="mt-2 text-sm font-semibold text-rose-300">{errores.filas}</p>}
        </section>

        <section className="rounded-3xl border border-white/[0.08] bg-[#0f0f12] p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h3 className="text-base font-extrabold text-white flex-1">Agregar material</h3>
            <div className="inline-flex rounded-xl border border-white/[0.1] bg-white/[0.04] p-1" role="tablist">
              {[["MP", "Materia prima"], ["SE", "Semielaborado"]].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={catalogo === id} type="button" onClick={() => { setCatalogo(id); setBuscar(""); }} className={`min-h-[38px] px-3.5 rounded-lg text-sm font-bold cursor-pointer transition-colors ${catalogo === id ? "bg-[#FF5A00] text-black" : "text-zinc-400 hover:text-white"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={catalogo === "MP" ? "Buscar materia prima…" : "Buscar semielaborado…"} aria-label="Buscar material" className={`${campo} pl-11`} />
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {resultados.slice(0, MAX_RESULTADOS).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => agregar(x)} className="w-full min-h-[52px] text-left flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2 hover:bg-white/[0.07] hover:border-[#FF5A00]/40 transition-colors cursor-pointer">
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white truncate">{x.nombre}</span><span className="block text-xs text-zinc-500">{x.codigo}</span></span>
                  <span className="shrink-0 w-8 h-8 grid place-items-center rounded-lg bg-[#FFD60A] text-black"><Plus size={16} strokeWidth={3} /></span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-zinc-500">
            {resultados.length === 0 ? "No hay más para agregar con esa búsqueda." : resultados.length > MAX_RESULTADOS ? `Mostrando ${MAX_RESULTADOS} de ${resultados.length}. Escribí para acotar.` : `${resultados.length} disponibles`}
          </p>
        </section>
      </div>

      <div className="sticky bottom-[-1.25rem] -mx-5 sm:-mx-6 -mb-5 mt-6 px-5 sm:px-6 pt-4 pb-5 bg-[#0d0d10] border-t border-white/[0.07] z-[5] flex gap-3">
        <button type="button" onClick={onCerrar} disabled={guardando} className="min-h-[54px] px-5 rounded-2xl bg-white/[0.07] text-base font-bold text-zinc-200 hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer">Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[54px] rounded-2xl bg-[#FFD60A] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.18)]">
          {guardando ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} strokeWidth={3} />}
          {receta ? "Guardar cambios" : "Crear receta"}
        </button>
      </div>
    </>
  );
}

export default function EditorReceta({ abierto, clave, parent, receta, cantidadRecetas, materias, semis, procesoSugerido, onCerrar, onGuardado, toast }) {
  return (
    <Drawer abierto={abierto} onCerrar={onCerrar} ancho="sm:w-[640px] lg:w-[720px]" titulo={receta ? "Editar receta" : "Nueva receta"} subtitulo={parent ? `${parent.codigo} · ${parent.nombre}` : ""}>
      {parent && <Cuerpo key={clave} parent={parent} receta={receta} cantidadRecetas={cantidadRecetas} materias={materias} semis={semis} procesoSugerido={procesoSugerido} onCerrar={onCerrar} onGuardado={onGuardado} toast={toast} />}
    </Drawer>
  );
}
