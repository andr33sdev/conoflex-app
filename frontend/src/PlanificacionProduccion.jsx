// Planificación OT: el jefe de producción arma la lista semanal (con lotes), reparte la producción
// de cada día y turno (máquina, operario, receta) y la lanza a la tablet de planta.
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Boton } from "./produccion/ui";
import { useToast } from "./produccion/useToast";
import { api, hoyISO, lunesDe, rangoSemana, semanaISO, sumarDias } from "./produccion/util";
import ListaSemana from "./planificacion/ListaSemana";
import TableroSemana from "./planificacion/TableroSemana";
import PanelTurno from "./planificacion/PanelTurno";
import AgregarLote from "./planificacion/AgregarLote";
import Maquinas from "./planificacion/Maquinas";
import Cargas from "./planificacion/Cargas";
import ProximoPaso from "./planificacion/ProximoPaso";
import { proximoPaso } from "./planificacion/reglas";

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

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1700px] mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-5 pb-24 lg:pb-8">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-3 mb-4">
          <div className="mr-auto hidden" />
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
            <Boton variante="fantasma" icono={Settings2} onClick={() => setVerMaquinas(true)} title="Máquinas de la planta">Máquinas</Boton>
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
            <ProximoPaso
              sugerencia={proximoPaso(plan.semana === semana ? plan : { items: [] }, semana < hoySemana ? "9999-12-31" : semana > hoySemana ? semana : hoyISO())}
              pctHecho={pctHecho}
              onAccion={(a) => (a.tipo === "agregar" ? setAgregando(true) : a.tipo === "cargas" ? setVerCargas(true) : setTurnoAbierto({ fecha: a.fecha, turno: a.turno }))}
            />

            <TableroSemana plan={plan} onAbrir={(fecha, turno) => setTurnoAbierto({ fecha, turno })} />
            <ListaSemana items={items} onAgregar={() => setAgregando(true)} onCambio={recargar} toast={toast} />
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
