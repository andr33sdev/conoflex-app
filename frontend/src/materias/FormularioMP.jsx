import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, Loader2, Plus, Search, X } from "lucide-react";
import { Drawer, Etiqueta } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { PLANTAS, UNIDADES, abrev, norm } from "./util";

const EASE = [0.22, 1, 0.36, 1];

function Fichas({ opciones, valor, onChange, etiqueta }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const sel = valor === o.v;
        return (
          <button key={o.v} type="button" role="radio" aria-checked={sel} onClick={() => onChange(o.v)} className={`relative min-h-[46px] px-4 rounded-xl text-[15px] font-bold border transition-colors cursor-pointer ${sel ? "border-[#FF5A00]/60 text-white" : "border-white/[0.09] text-zinc-400 hover:text-white bg-[#17171c]"}`}>
            {sel && <motion.span layoutId={`ficha-${etiqueta}`} className="absolute inset-0 rounded-xl bg-[#FF5A00]/15" transition={{ duration: 0.3, ease: EASE }} />}
            <span className="relative">{o.t}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Elegir proveedor: escribís para buscar y tocás el que corresponde. */
function SelectorProveedor({ proveedores, valor, onChange }) {
  const [q, setQ] = useState("");
  const elegido = proveedores.find((p) => p.id === valor);
  const lista = useMemo(() => {
    const t = norm(q);
    return proveedores.filter((p) => !t || norm(p.nombre).includes(t)).slice(0, 6);
  }, [proveedores, q]);

  if (elegido) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-3.5 min-h-[52px]">
        <Building2 size={18} className="text-emerald-300 shrink-0" />
        <span className="flex-1 min-w-0 truncate font-bold text-white">{elegido.nombre}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Quitar proveedor" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={16} /></button>
      </motion.div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor…" className={`${campo} pl-10`} />
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {lista.map((p, i) => (
          <motion.button key={p.id} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => onChange(p.id)} className="text-left min-h-[46px] px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.06] text-[15px] font-semibold text-zinc-100 cursor-pointer inline-flex items-center gap-2.5">
            <Building2 size={15} className="text-zinc-500 shrink-0" /> <span className="truncate">{p.nombre}</span>
          </motion.button>
        ))}
        {!lista.length && <p className="text-sm text-zinc-500 px-1 py-2">{proveedores.length ? "No hay proveedores con ese nombre." : "Todavía no hay proveedores cargados. Podés crearla igual y asignarlo después."}</p>}
      </div>
    </div>
  );
}

/** Alta y edición de una materia prima. En edición el código y el nombre no se tocan (los usan las recetas y las compras). */
const VACIO = { codigo: "", nombre: "", unidad: "KILOS", proveedor_id: null, planta: "Argentina", minimo: "", stock: "", motivo: "" };
const desdeItem = (it) => ({ codigo: it.codigo, nombre: it.nombre, unidad: String(it.unidad_medida || "KILOS").toUpperCase(), proveedor_id: it.proveedor_id || null, planta: it.planta || "Argentina", minimo: it.stock_minimo ? String(it.stock_minimo) : "", stock: String(it.stock_actual ?? 0), motivo: "" });

// Se monta de nuevo cada vez que se abre (el padre cambia la key): el estado inicial sale de lo que llega en ese momento.
export default function FormularioMP({ abierto, modo: modoProp, item: itemProp, items, proveedores, esAdmin, onCerrar, onGuardado }) {
  const [modo] = useState(modoProp);
  const [item] = useState(itemProp);
  const editando = modo === "editar" && !!item;
  const [f, setF] = useState(() => (modoProp === "editar" && itemProp ? desdeItem(itemProp) : VACIO));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(false);
  const primero = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const t = setTimeout(() => primero.current?.focus(), 380);
    return () => clearTimeout(t);
  }, [abierto]);

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v !== null && typeof v === "object" && v.target ? v.target.value : v }));
  const codigo = f.codigo.trim().toUpperCase();
  const repetido = !editando && codigo && items.find((x) => String(x.codigo).toUpperCase() === codigo);
  const errores = {};
  if (!editando && !codigo) errores.codigo = "Poné el código.";
  if (repetido) errores.codigo = `Ya existe: ${repetido.nombre}.`;
  if (!editando && !f.nombre.trim()) errores.nombre = "Poné el nombre.";
  if (f.minimo !== "" && !(Number(String(f.minimo).replace(",", ".")) >= 0)) errores.minimo = "Tiene que ser un número.";
  const cambioStock = editando && esAdmin && Number(String(f.stock).replace(",", ".")) !== Number(item.stock_actual);

  const guardar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) return;
    setGuardando(true);
    setError("");
    try {
      await onGuardado({ editando, f, codigo });
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      setGuardando(false);
    }
  };

  const ver = (k) => (intento ? errores[k] : undefined);
  const u = abrev(f.unidad);

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={editando ? "Editar materia prima" : "Nueva materia prima"}
      subtitulo={editando ? `${item.codigo} · ${item.nombre}` : "Código, nombre, unidad y proveedor"}
      pie={
        <div className="flex flex-col gap-2">
          <AnimatePresence>{error && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-sm font-semibold text-rose-300 overflow-hidden">{error}</motion.p>}</AnimatePresence>
          <div className="flex gap-3">
            <button type="button" onClick={onCerrar} className="min-h-[56px] px-5 rounded-2xl text-zinc-300 hover:text-white hover:bg-white/[0.06] font-bold cursor-pointer">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[56px] rounded-2xl bg-[#FFD60A] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2.5 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.18)]">
              {guardando ? <Loader2 size={20} className="animate-spin" /> : editando ? <Check size={20} strokeWidth={3} /> : <Plus size={20} strokeWidth={3} />}
              {editando ? "Guardar cambios" : "Crear materia prima"}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); guardar(); }} className="flex flex-col gap-6">
        {!editando && (
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div>
              <Etiqueta>Código</Etiqueta>
              <input ref={primero} value={f.codigo} onChange={(e) => set("codigo")(e.target.value.toUpperCase())} placeholder="Ej: PE-NAT" maxLength={60} autoCapitalize="characters" className={`${campo} font-mono font-bold ${ver("codigo") ? "!border-rose-500/70" : ""}`} />
              {ver("codigo") && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.codigo}</p>}
            </div>
            <div>
              <Etiqueta>Nombre</Etiqueta>
              <input value={f.nombre} onChange={set("nombre")} placeholder="Ej: Polietileno natural" maxLength={200} className={`${campo} ${ver("nombre") ? "!border-rose-500/70" : ""}`} />
              {ver("nombre") && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errores.nombre}</p>}
            </div>
          </div>
        )}

        <div>
          <Etiqueta>Unidad de medida</Etiqueta>
          <Fichas etiqueta="unidad" opciones={UNIDADES} valor={f.unidad} onChange={set("unidad")} />
        </div>

        <div>
          <Etiqueta>Proveedor</Etiqueta>
          <SelectorProveedor proveedores={proveedores} valor={f.proveedor_id} onChange={set("proveedor_id")} />
        </div>

        <div>
          <Etiqueta>Planta</Etiqueta>
          <Fichas etiqueta="planta" opciones={PLANTAS.map((p) => ({ v: p, t: p }))} valor={f.planta} onChange={set("planta")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Etiqueta>Punto de pedido (opcional)</Etiqueta>
            <div className="relative">
              <input value={f.minimo} onChange={(e) => set("minimo")(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="0" className={`${campo} pr-12 tabular-nums`} />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">{u}</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">Por debajo de esto, aparece como “Reponer”.</p>
            {ver("minimo") && <p className="mt-1 text-sm font-semibold text-rose-300">{errores.minimo}</p>}
          </div>
          {(editando ? esAdmin : esAdmin) && (
            <div>
              <Etiqueta>{editando ? "Stock actual" : "Stock inicial (opcional)"}</Etiqueta>
              <div className="relative">
                <input value={f.stock} onChange={(e) => set("stock")(e.target.value.replace(/[^\d.,-]/g, ""))} inputMode="decimal" placeholder="0" className={`${campo} pr-12 tabular-nums`} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">{u}</span>
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">Solo administradores. Queda en el historial.</p>
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {cambioStock && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Etiqueta>Motivo del ajuste (opcional)</Etiqueta>
              <input value={f.motivo} onChange={set("motivo")} maxLength={300} placeholder="Ej: recuento físico" className={campo} />
            </motion.div>
          )}
        </AnimatePresence>
        {!esAdmin && <p className="text-xs text-zinc-500 -mt-2">El stock lo carga un administrador; si recién la creás, queda en 0 hasta la primera compra o ajuste.</p>}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
