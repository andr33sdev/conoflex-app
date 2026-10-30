import { useMemo, useState } from "react";
import { Boxes, Building2, Check, Link2, Loader2, Plus, Trash2, Unlink } from "lucide-react";
import { Drawer, Etiqueta } from "../produccion/ui";
import { api } from "../produccion/util";
import Autocompletar from "./Autocompletar";
import PrioridadPills from "./PrioridadPills";
import { materiaDelItem, nf, nroSC, num, unidadCorta } from "./formato";

let contador = 0;
const nuevaFila = () => ({ k: `n${++contador}`, articulo: "", proveedor: "", cantidad_solicitada: "1", prioridad: 3, materia_prima_id: null });
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Cartel que dice si el renglón va a sumar stock al recibirse. */
function Vinculo({ item, materias }) {
  if (!String(item.articulo).trim()) return null;
  const mp = materiaDelItem(item, materias);
  if (mp) {
    return (
      <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-300/90 mt-2">
        <Link2 size={13} className="mt-0.5 shrink-0" />
        <span>Al recibirlo suma al stock de <b className="text-emerald-200">{mp.nombre}</b> (hoy {nf(Number(mp.stock_actual), 2)} {unidadCorta(mp)})</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-xs font-semibold text-zinc-500 mt-2">
      <Unlink size={13} className="mt-0.5 shrink-0" />
      <span>No está vinculado a una materia prima: al recibirlo no cambia el stock. Elegí una de la lista si querés que sume.</span>
    </p>
  );
}

export default function FormularioSolicitud({ abierto, solicitud, materias, proveedores, onCerrar, onGuardado, toast }) {
  const [fecha, setFecha] = useState(() => (solicitud ? String(solicitud.fecha).split("T")[0] : hoyISO()));
  const [items, setItems] = useState(() => (solicitud ? solicitud.items.map((i) => ({ ...i, k: `e${i.id}`, cantidad_solicitada: String(i.cantidad_solicitada) })) : [nuevaFila()]));
  const [guardando, setGuardando] = useState(false);

  const opcionesMP = useMemo(
    () => materias.map((m) => ({ clave: `m${m.id}`, titulo: m.nombre, detalle: m.codigo, extra: `${nf(Number(m.stock_actual), 1)} ${unidadCorta(m)}`, valor: m })),
    [materias],
  );
  const opcionesProv = useMemo(() => proveedores.map((p) => ({ clave: `p${p.id ?? p.nombre}`, titulo: p.nombre, valor: p })), [proveedores]);

  const cambiar = (k, cambios) => setItems((l) => l.map((i) => (i.k === k ? { ...i, ...cambios } : i)));

  const guardar = async () => {
    if (!items.length) return toast("Agregá al menos un artículo.", "error");
    const mal = items.findIndex((i) => !String(i.articulo).trim() || num(i.cantidad_solicitada) <= 0);
    if (mal >= 0) return toast(`Revisá el artículo ${mal + 1}: necesita nombre y una cantidad mayor a cero.`, "error");
    setGuardando(true);
    try {
      const payload = {
        fecha,
        items: items.map((i) => ({
          ...(i.id ? { id: i.id } : {}),
          articulo: String(i.articulo).trim(),
          proveedor: i.proveedor || "",
          cantidad_solicitada: num(i.cantidad_solicitada),
          cantidad_recibida: num(i.cantidad_recibida),
          prioridad: i.prioridad,
          numero_oc: i.numero_oc || null,
          materia_prima_id: i.materia_prima_id || null,
        })),
      };
      const r = await api(solicitud ? `/api/compras/solicitudes/${solicitud.id}` : "/api/compras/solicitudes", { method: solicitud ? "PUT" : "POST", body: payload });
      onGuardado(!solicitud, solicitud ? solicitud.id : r.insertId);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={solicitud ? `Editar ${nroSC(solicitud.id).replace("-", "\u2011")}` : "Nueva solicitud de compra"}
      subtitulo="Qué hay que comprar, a quién y qué tan urgente es."
      ancho="sm:w-[640px] lg:w-[720px]"
      pie={
        <div className="flex gap-2.5">
          <button onClick={onCerrar} className="min-h-[52px] px-5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold cursor-pointer">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 min-h-[52px] rounded-2xl bg-[#FFD60A] hover:bg-white text-black font-extrabold text-base inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors">
            {guardando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} {solicitud ? "Guardar cambios" : "Crear solicitud"}
          </button>
        </div>
      }
    >
      <div className="w-full sm:w-56 mb-6">
        <Etiqueta>Fecha de emisión</Etiqueta>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.1] px-3 text-[15px] font-semibold text-white outline-none focus:border-[#FF5A00]/70 [color-scheme:dark]" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2"><Boxes size={17} className="text-[#FF5A00]" /> Artículos a solicitar <span className="text-zinc-500 font-bold">({items.length})</span></h3>
        <button onClick={() => setItems((l) => [...l, nuevaFila()])} className="min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A]/10 text-[#FFD60A] hover:bg-[#FFD60A]/20 text-sm font-extrabold inline-flex items-center gap-1.5 cursor-pointer"><Plus size={16} /> Agregar</button>
      </div>

      <div className="space-y-3">
        {items.map((i, idx) => (
          <div key={i.k} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-zinc-500">Artículo {idx + 1}</span>
              <button onClick={() => setItems((l) => l.filter((x) => x.k !== i.k))} aria-label={`Quitar artículo ${idx + 1}`} className="w-9 h-9 -mr-1.5 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer transition-colors"><Trash2 size={16} /></button>
            </div>
            <Autocompletar
              etiqueta="Materia prima / artículo"
              valor={i.articulo}
              icono={Boxes}
              placeholder="Buscar materia prima o escribir el artículo…"
              opciones={opcionesMP}
              onTexto={(t) => cambiar(i.k, { articulo: t, materia_prima_id: null })}
              onElegir={(o) => cambiar(i.k, { articulo: o.valor.nombre, materia_prima_id: o.valor.id })}
            />
            <Vinculo item={i} materias={materias} />
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3 mt-4">
              <Autocompletar etiqueta="Proveedor sugerido" valor={i.proveedor} icono={Building2} placeholder="Buscar proveedor…" opciones={opcionesProv} onTexto={(t) => cambiar(i.k, { proveedor: t })} onElegir={(o) => cambiar(i.k, { proveedor: o.valor.nombre })} />
              <div>
                <Etiqueta>Cantidad</Etiqueta>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={i.cantidad_solicitada} onChange={(e) => cambiar(i.k, { cantidad_solicitada: e.target.value })} className="w-full min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.1] px-3 text-[15px] font-extrabold text-white text-right tabular-nums outline-none focus:border-[#FF5A00]/70" />
              </div>
            </div>
            <div className="mt-4">
              <Etiqueta>Prioridad</Etiqueta>
              <PrioridadPills valor={i.prioridad} onChange={(p) => cambiar(i.k, { prioridad: p })} />
            </div>
            {num(i.cantidad_recibida) > 0 && <p className="text-xs text-zinc-500 mt-3">Ya se recibieron {nf(num(i.cantidad_recibida), 3)} de este artículo.</p>}
          </div>
        ))}
      </div>
    </Drawer>
  );
}
