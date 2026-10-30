// Planificación OT: el jefe de producción arma la lista semanal (con lotes), reparte la producción
// de cada día y turno (máquina, operario, receta) y la lanza a la tablet de planta.
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { Boton } from "./produccion/ui";
import { useToast } from "./produccion/useToast";
import { api, hoyISO, lunesDe, num, rangoSemana, semanaISO, sumarDias } from "./produccion/util";
import ListaSemana from "./planificacion/ListaSemana";
import TableroSemana from "./planificacion/TableroSemana";
import PanelTurno from "./planificacion/PanelTurno";
import AgregarLote from "./planificacion/AgregarLote";
import Maquinas from "./planificacion/Maquinas";
import Cargas from "./planificacion/Cargas";

function Dato({ t, v, acento }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111114] px-4 py-3">
      <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">{t}</span>
      <span className={`block mt-0.5 text-2xl font-extrabold tabular-nums ${acento || "text-white"}`}>{v}</span>
    </div>
  );
}

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

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-28 lg:pb-10">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between mb-6">
          <div>
            <h1 className="cf-h1-largo text-2xl font-extrabold uppercase text-white">Plan de producción</h1>
            <p className="mt-1 text-sm text-zinc-500">Armá la semana, repartí los turnos y lanzalos a la tablet de planta.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-2xl border border-white/[0.08] bg-[#111114] p-1">
              <button onClick={() => setSemana(sumarDias(semana, -7))} aria-label="Semana anterior" className="w-11 h-11 grid place-items-center rounded-xl text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronLeft size={20} /></button>
              <div className="px-3 text-center min-w-[170px]">
                <span className="block text-sm font-extrabold text-white">Semana {semanaISO(semana)}</span>
                <span className="block text-xs text-zinc-500">{rangoSemana(semana)}</span>
              </div>
              <button onClick={() => setSemana(sumarDias(semana, 7))} aria-label="Semana siguiente" className="w-11 h-11 grid place-items-center rounded-xl text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronRight size={20} /></button>
            </div>
            {semana !== hoySemana && <Boton variante="suave" onClick={() => setSemana(hoySemana)}>Hoy</Boton>}
            <Boton variante="suave" icono={Settings2} onClick={() => setVerMaquinas(true)}>Máquinas</Boton>
            <Boton variante={plan?.cargas_pendientes ? "naranja" : "suave"} icono={ClipboardCheck} onClick={() => setVerCargas(true)} className="relative">
              Cargas
              {plan?.cargas_pendientes > 0 && <span className="ml-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-black/80 text-[#FFD60A] text-xs font-extrabold grid place-items-center">{plan.cargas_pendientes}</span>}
            </Boton>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Dato t="Lotes en la lista" v={items.length} />
              <Dato t="Unidades planificadas" v={num(tot.plan)} />
              <Dato t="Repartidas en turnos" v={num(tot.asig)} acento="text-[#FF5A00]" />
              <Dato t="Producidas (aprobadas)" v={num(tot.hecho)} acento="text-emerald-300" />
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] items-start">
              <ListaSemana items={items} onAgregar={() => setAgregando(true)} onCambio={recargar} toast={toast} />
              <TableroSemana plan={plan} onAbrir={(fecha, turno) => setTurnoAbierto({ fecha, turno })} />
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
