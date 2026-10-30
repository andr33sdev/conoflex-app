import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { History, Loader2, Plus, ScrollText } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { api } from "../produccion/util";
import AlertaCambio from "./AlertaCambio";
import Historial from "./Historial";
import Receta from "./Receta";

/** Todas las recetas de un producto + su historial de cambios + avisos de producción. */
export default function LibroRecetas({ parent, abierto, onCerrar, onCambio, onNueva, onEditar, version, admin, toast }) {
  const [recetas, setRecetas] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [tab, setTab] = useState("recetas");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const [tick, setTick] = useState(0);

  // Se recarga al abrir, cuando el editor guarda algo (version) y después de cada acción (tick).
  useEffect(() => {
    if (!abierto || !parent) return undefined;
    let vivo = true;
    const ruta = parent.type === "SE" ? `/api/ingenierias/semielaborado/${parent.id}` : `/api/ingenierias/producto-terminado/${parent.id}`;
    Promise.all([
      api(ruta),
      api(`/api/ingenierias/historial?parent_type=${parent.type}&parent_id=${parent.id}`),
      admin && parent.type === "SE" ? api("/api/ingenierias/alertas").catch(() => []) : Promise.resolve([]),
    ])
      .then(([r, h, al]) => {
        if (!vivo) return;
        setRecetas(r);
        setHistorial(h);
        setAlertas(al.filter((x) => x.semielaborado_id === parent.id));
        setError("");
      })
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [abierto, parent, admin, version, tick]);

  const accion = async (fn, textoOk, detalle) => {
    setOcupado(true);
    try {
      await fn();
      setTick((t) => t + 1);
      window.dispatchEvent(new Event("cf:alertas"));
      onCambio(textoOk, detalle);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setOcupado(false);
    }
  };

  const activar = (r) => accion(() => api(`/api/ingenierias/${r.id}/activar`, { method: "PUT", body: { parent_id: parent.id, parent_type: parent.type } }), "¡Receta activada!", `“${r.nombre_version}” ahora se usa en planta`);
  const eliminar = (r) => accion(() => api(`/api/ingenierias/${r.id}`, { method: "DELETE" }), "Receta eliminada", `“${r.nombre_version}”`);
  const adoptar = (a, nombre) => accion(() => api(`/api/ingenierias/alertas/${a.id}/adoptar`, { method: "PUT", body: nombre ? { nombre_version: nombre } : {} }), "¡Fórmula actualizada!", "La fórmula usada en producción es ahora la receta activa");
  const descartar = (a) => accion(() => api(`/api/ingenierias/alertas/${a.id}/descartar`, { method: "PUT" }), "Se mantiene la receta actual", "El aviso quedó resuelto");

  return (
    <Drawer abierto={abierto} onCerrar={onCerrar} ancho="sm:w-[640px] lg:w-[720px]" titulo={parent ? parent.codigo : ""} subtitulo={parent ? parent.nombre : ""}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/[0.1] bg-white/[0.04] p-1" role="tablist">
            <button role="tab" aria-selected={tab === "recetas"} onClick={() => setTab("recetas")} className={`min-h-[40px] px-4 rounded-lg text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${tab === "recetas" ? "bg-[#FF5A00] text-black" : "text-zinc-400 hover:text-white"}`}><ScrollText size={15} /> Recetas{recetas ? ` (${recetas.length})` : ""}</button>
            <button role="tab" aria-selected={tab === "historial"} onClick={() => setTab("historial")} className={`min-h-[40px] px-4 rounded-lg text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${tab === "historial" ? "bg-[#FF5A00] text-black" : "text-zinc-400 hover:text-white"}`}><History size={15} /> Historial ({historial.length})</button>
          </div>
          <button onClick={() => onNueva(recetas?.length ?? 0)} className="ml-auto min-h-[46px] px-5 rounded-2xl bg-[#FFD60A] text-black text-[15px] font-extrabold inline-flex items-center gap-2 hover:bg-white active:scale-[0.98] transition-all cursor-pointer shadow-[0_8px_24px_rgba(255,214,10,0.16)]"><Plus size={17} strokeWidth={3} /> Nueva receta</button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><b>No se pudo cargar.</b><p className="text-sm mt-1">{error}</p><button onClick={() => setTick((t) => t + 1)} className="mt-3 min-h-[44px] px-4 rounded-xl bg-white/10 font-bold cursor-pointer">Reintentar</button></div>
        ) : !recetas ? (
          <div className="py-16 grid place-items-center text-[#FF5A00]"><Loader2 className="animate-spin" size={28} /></div>
        ) : tab === "historial" ? (
          <Historial eventos={historial} />
        ) : (
          <>
            {alertas.map((a) => <AlertaCambio key={a.id} alerta={a} ocupado={ocupado} onAdoptar={(n) => adoptar(a, n)} onDescartar={() => descartar(a)} />)}
            {recetas.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-dashed border-white/[0.14] px-6 py-14 text-center">
                <span className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FF5A00]/25 to-[#FFD60A]/10 border border-[#FF5A00]/25 grid place-items-center text-[#ff9a63]"><ScrollText size={28} /></span>
                <p className="mt-4 text-lg font-extrabold text-white">Este producto no tiene recetas</p>
                <p className="mt-1 text-sm text-zinc-400">Creá la primera con la fórmula por tachada.</p>
              </motion.div>
            ) : (
              recetas.map((r) => <Receta key={r.id} r={r} ocupado={ocupado} onActivar={() => activar(r)} onEditar={() => onEditar(r, recetas.length)} onEliminar={() => eliminar(r)} />)
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
