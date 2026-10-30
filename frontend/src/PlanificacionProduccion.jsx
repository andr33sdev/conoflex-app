// Planificación OT: el jefe de producción arma la lista semanal (con lotes), reparte la producción
// de cada día y turno (máquina, operario, receta) y la lanza a la tablet de planta.
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Boton } from "./produccion/ui";
import { useToast } from "./produccion/useToast";
import { api, hoyISO, lunesDe, num, rangoSemana, semanaISO, sumarDias } from "./produccion/util";
import ListaSemana from "./planificacion/ListaSemana";
import TableroSemana from "./planificacion/TableroSemana";
import PanelTurno from "./planificacion/PanelTurno";
import AgregarLote from "./planificacion/AgregarLote";
import Maquinas from "./planificacion/Maquinas";
import Cargas from "./planificacion/Cargas";

export default function PlanificacionProduccion() {
  const [semana, setSemana] = useState(() => lunesDe(hoyISO()));
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [maquinas, setMaquinas] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [versionMaq, setVersionMaq] = useState(0);

  const [turnoAbierto, setTurnoAbierto] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const [verMaquinas, setVerMaquinas] = useState(false);
  const [verCargas, setVerCargas] = useState(false);
  const { mostrar: toast, nodo: toastNodo } = useToast();

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    api(`/api/prod/plan?semana=${semana}`)
      .then((p) => vivo && (setPlan(p), setError("")))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [semana, version]);

  useEffect(() => {
    let vivo = true;
    api("/api/prod/maquinas").then((m) => vivo && setMaquinas(m)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [versionMaq]);
  useEffect(() => {
    let vivo = true;
    api("/api/prod/operarios").then((o) => vivo && setOperarios(o)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Las cargas de la tablet llegan solas: se refresca el plan cada tanto si no se está editando.
  const editando = !!turnoAbierto || agregando || verMaquinas || verCargas;
  useEffect(() => {
    if (editando) return;
    const t = setInterval(recargar, 45000);
    return () => clearInterval(t);
  }, [editando, recargar]);

  const cargando = !error && plan?.semana !== semana;
  const items = plan?.semana === semana ? plan.items : [];
  const hoySemana = lunesDe(hoyISO());

  const tot = items.reduce((a, i) => ({ plan: a.plan + i.cantidad_semana, asig: a.asig + i.asignado, hecho: a.hecho + i.producido }), { plan: 0, asig: 0, hecho: 0 });
  const pctHecho = tot.plan > 0 ? Math.min(100, Math.round((tot.hecho / tot.plan) * 100)) : 0;
  const pctAsig = tot.plan > 0 ? Math.min(100, (tot.asig / tot.plan) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1700px] mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5 pb-24 lg:pb-8">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-4">
          <div className="mr-auto min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">Planificación OT</h1>
            <p className="mt-1 text-xs sm:text-[13px] text-zinc-500 truncate">Armá la semana, repartí los turnos y lanzalos a la tablet.</p>
          </div>
          <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#111114] p-0.5">
            <button onClick={() => setSemana(sumarDias(semana, -7))} aria-label="Semana anterior" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronLeft size={18} /></button>
            <div className="px-2 text-center min-w-[150px]">
              <span className="block text-[13px] font-extrabold text-white leading-tight">Semana {semanaISO(semana)}</span>
              <span className="block text-[11px] text-zinc-500 leading-tight">{rangoSemana(semana)}</span>
            </div>
            <button onClick={() => setSemana(sumarDias(semana, 7))} aria-label="Semana siguiente" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronRight size={18} /></button>
          </div>
          {semana !== hoySemana && <Boton variante="suave" onClick={() => setSemana(hoySemana)}>Hoy</Boton>}
          <div className="flex items-center gap-2">
            <Boton variante="suave" icono={Settings2} onClick={() => setVerMaquinas(true)} aria-label="Máquinas"><span className="hidden sm:inline">Máquinas</span></Boton>
            <Boton variante={plan?.cargas_pendientes ? "naranja" : "suave"} icono={ClipboardCheck} onClick={() => setVerCargas(true)}>
              <span className="hidden sm:inline">Cargas</span>
              {plan?.cargas_pendientes > 0 && <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-black/80 text-[#FFD60A] text-xs font-extrabold grid place-items-center">{plan.cargas_pendientes}</span>}
            </Boton>
            <Boton variante="primario" icono={Plus} onClick={() => setAgregando(true)}><span className="hidden sm:inline">Agregar lote</span><span className="sm:hidden">Lote</span></Boton>
          </div>
        </header>

        {error && !plan ? (
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
            <p className="text-rose-100 font-semibold">{error}</p>
            <Boton className="mt-4" icono={RefreshCw} onClick={recargar}>Reintentar</Boton>
          </div>
        ) : !plan ? (
          <div className="flex items-center justify-center gap-3 py-32 text-zinc-500"><Loader2 className="animate-spin" size={22} /> Cargando el plan…</div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: cargando ? 0.55 : 1 }} transition={{ duration: 0.2 }}>
            {/* Resumen de la semana en una sola línea */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0f0f12] px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold tabular-nums text-white">{pctHecho}%</span>
                <span className="text-xs text-zinc-500">de la semana producido</span>
              </div>
              <div className="flex-1 min-w-[140px] h-2 rounded-full bg-white/[0.07] overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 bg-[#FF5A00]/40" style={{ width: `${pctAsig}%` }} />
                <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${pctHecho}%` }} />
              </div>
              <dl className="flex gap-x-5 text-xs text-zinc-500">
                <div><dt className="inline">Lotes </dt><dd className="inline font-bold text-zinc-200 tabular-nums">{items.length}</dd></div>
                <div><dt className="inline">Planificadas </dt><dd className="inline font-bold text-zinc-200 tabular-nums">{num(tot.plan)}</dd></div>
                <div><dt className="inline">En turnos </dt><dd className="inline font-bold text-[#ff8a4d] tabular-nums">{num(tot.asig)}</dd></div>
                <div><dt className="inline">Aprobadas </dt><dd className="inline font-bold text-emerald-300 tabular-nums">{num(tot.hecho)}</dd></div>
              </dl>
            </div>

            <div className="grid gap-4 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_320px] items-start">
              <TableroSemana plan={plan} onAbrir={(fecha, turno) => setTurnoAbierto({ fecha, turno })} />
              <div className="xl:sticky xl:top-2 xl:max-h-[calc(100dvh-7rem)] flex flex-col">
                <ListaSemana items={items} onAgregar={() => setAgregando(true)} onCambio={recargar} toast={toast} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <PanelTurno turnoAbierto={turnoAbierto} plan={plan?.semana === semana ? plan : null} maquinas={maquinas} operarios={operarios} onCerrar={() => setTurnoAbierto(null)} onCambio={recargar} toast={toast} />
      <AgregarLote abierto={agregando} onCerrar={() => setAgregando(false)} semana={semana} onCambio={recargar} toast={toast} />
      <Maquinas abierto={verMaquinas} onCerrar={() => setVerMaquinas(false)} maquinas={maquinas} onCambio={() => setVersionMaq((v) => v + 1)} toast={toast} />
      <Cargas abierto={verCargas} onCerrar={() => setVerCargas(false)} onCambio={recargar} toast={toast} />
      {toastNodo}
    </div>
  );
}
