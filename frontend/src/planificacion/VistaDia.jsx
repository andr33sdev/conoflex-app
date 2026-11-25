// Vista principal del día: una grilla que se lee de un vistazo, MÁQUINA por TURNO.
// Para cada máquina se ve qué produce de día y de noche, en qué estado, y las acciones
// (activar en tablet, aprobar lo cargado) quedan a la mano.
import { useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Moon, Rocket, Sun } from "lucide-react";
import { Boton, Chip } from "../produccion/ui";
import { api, diaCorto, diaMes, nombreDia, num } from "../produccion/util";
import { estadoTurno, problemasDeTurno } from "./reglas";

const SIN_MAQUINA = "sin-maquina";

// Estado visual de una asignación (color de borde + etiqueta corta).
function estadoAsig(a, lanzado) {
  if (a.real && a.real.estado === "APROBADA") return { borde: "#34d399", tono: "verde", texto: "Aprobado" };
  if (a.real) return { borde: "#FFD60A", tono: "amarillo", texto: "Cargado · por aprobar" };
  if (lanzado) return { borde: "#38bdf8", tono: "azul", texto: "En tablet" };
  if (problemasDeTurno([a]).length) return { borde: "#ff8a4d", tono: "naranja", texto: "Faltan datos" };
  return { borde: "#FF5A00", tono: "naranja", texto: "Planificado" };
}

function Tarjeta({ a, lanzado, onAbrir, onAprobar }) {
  const e = estadoAsig(a, lanzado);
  const cant = a.real ? a.real.buenas : a.cantidad;
  const pendientes = a.real?.cargas_pendientes?.length ? a.real.cargas_pendientes : null;
  return (
    <div style={{ borderLeftColor: e.borde }} className="rounded-r-lg border border-white/[0.08] border-l-[3px] bg-[#131317] p-2.5">
      <button onClick={onAbrir} className="w-full text-left cursor-pointer">
        <p className="text-[13px] font-semibold text-white leading-snug truncate">{a.semielaborado_nombre}</p>
        <p className="text-[12px] text-zinc-500 tabular-nums">
          {num(cant)} u{a.operario ? ` · ${a.operario}` : " · sin operario"}
        </p>
        {a.motivo && <p className="text-[11px] text-zinc-500 truncate" title={a.motivo}>· {a.motivo}</p>}
      </button>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: e.borde }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.borde }} />
          {e.texto}
        </span>
        {pendientes && (
          <button onClick={() => onAprobar(pendientes)} className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-md px-2 py-0.5 cursor-pointer">
            <Check size={12} /> Aprobar
          </button>
        )}
      </div>
    </div>
  );
}

// Una celda = lo que hace una máquina en un turno. Vacía => "Libre" (abre el turno para asignar).
function Celda({ asigs, lanzado, sinProd, onAbrir, onAprobar }) {
  if (sinProd) return <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-2.5 grid place-items-center text-[12px] text-zinc-600 min-h-[70px]">No se produce</div>;
  if (!asigs.length)
    return (
      <button onClick={onAbrir} className="w-full rounded-lg border border-dashed border-white/[0.12] hover:border-[#FF5A00]/50 hover:bg-white/[0.03] p-2.5 grid place-items-center text-[12px] text-zinc-600 hover:text-[#FF5A00] min-h-[70px] cursor-pointer transition-colors">
        Libre
      </button>
    );
  return (
    <div className="flex flex-col gap-1.5">
      {asigs.map((a) => (
        <Tarjeta key={a.id} a={a} lanzado={lanzado} onAbrir={onAbrir} onAprobar={onAprobar} />
      ))}
    </div>
  );
}

// Encabezado de una columna de turno: su estado y el botón de activar en tablet cuando está listo.
function CabeceraTurno({ turno, info, asigs, ocupado, onActivar }) {
  const Icono = turno === "NOCHE" ? Moon : Sun;
  const est = estadoTurno(info, asigs);
  const problemas = problemasDeTurno(asigs);
  const listo = !info?.lanzado && !info?.sin_produccion && asigs.length > 0 && problemas.length === 0;
  const faltan = !info?.lanzado && asigs.length > 0 && problemas.length > 0;
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider ${turno === "NOCHE" ? "text-sky-300" : "text-[#FFD60A]"}`}>
        <Icono size={14} /> {turno === "NOCHE" ? "Noche" : "Día"}
      </span>
      {listo ? (
        <Boton variante="primario" icono={Rocket} onClick={onActivar} disabled={ocupado} className="!min-h-[30px] !px-2.5 !text-[11px]">Activar en tablet</Boton>
      ) : faltan ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FFD60A]"><AlertTriangle size={12} /> faltan datos</span>
      ) : (
        <Chip tono={est.tono}>{est.texto}</Chip>
      )}
    </div>
  );
}

export default function VistaDia({ plan, maquinas, onAbrirTurno, onCambio, toast }) {
  const [elegido, setElegido] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = plan.dias;
  const diaSel = elegido && dias.includes(elegido) ? elegido : dias.includes(hoy) ? hoy : dias[0];

  const infoDe = (turno) => plan.turnos.find((t) => t.fecha === diaSel && t.turno === turno);
  const asigsDia = plan.asignaciones.filter((a) => a.fecha === diaSel);

  // Filas = máquinas activas + las que tengan algo asignado ese día + "Sin máquina" si hace falta.
  const activas = maquinas.filter((m) => m.activa);
  const idsConAsig = new Set(asigsDia.map((a) => a.maquina_id).filter(Boolean));
  const extras = maquinas.filter((m) => !m.activa && idsConAsig.has(m.id));
  const filas = [...activas, ...extras];
  const haySinMaquina = asigsDia.some((a) => !a.maquina_id);

  const asigsDe = (maqId, turno) =>
    asigsDia.filter((a) => a.turno === turno && (maqId === SIN_MAQUINA ? !a.maquina_id : a.maquina_id === maqId));

  const llamar = async (fn, ok) => {
    setOcupado(true);
    try {
      await fn();
      if (ok) toast(ok);
      onCambio();
    } catch (e) {
      toast(e.problemas?.length ? `${e.message} ${e.problemas[0]}` : e.message, "error");
    } finally {
      setOcupado(false);
    }
  };
  const activar = (turno) => llamar(() => api("/api/prod/turnos/lanzar", { method: "POST", body: { fecha: diaSel, turno } }), "Turno activado: ya aparece en la tablet");
  const aprobar = (ids) => llamar(async () => { for (const id of ids) await api(`/api/prod/cargas/${id}/aprobar`, { method: "PUT" }); }, ids.length > 1 ? "Cargas aprobadas" : "Carga aprobada");

  const Fila = ({ maq }) => {
    const id = maq === SIN_MAQUINA ? SIN_MAQUINA : maq.id;
    const nombre = maq === SIN_MAQUINA ? "Sin máquina" : maq.nombre;
    return (
      <>
        <div className={`flex items-center text-[13px] font-semibold rounded-lg px-3 ${maq === SIN_MAQUINA ? "text-[#FFD60A] bg-[#FFD60A]/[0.06]" : "text-white bg-[#131317]"}`}>{nombre}</div>
        {["DIA", "NOCHE"].map((turno) => (
          <Celda key={turno} asigs={asigsDe(id, turno)} lanzado={!!infoDe(turno)?.lanzado} sinProd={!!infoDe(turno)?.sin_produccion} onAbrir={() => onAbrirTurno(diaSel, turno)} onAprobar={aprobar} />
        ))}
      </>
    );
  };

  return (
    <section aria-label="Producción del día por máquina">
      {/* Selector de día */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3">
        {dias.map((fecha) => {
          const sel = fecha === diaSel;
          const conCosas = plan.asignaciones.some((a) => a.fecha === fecha);
          return (
            <button key={fecha} onClick={() => setElegido(fecha)} className={`relative shrink-0 min-w-[58px] py-2 rounded-xl border text-center cursor-pointer transition-colors ${sel ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]"}`}>
              <span className="block text-[11px] font-extrabold uppercase">{diaCorto(fecha)}</span>
              <span className={`block text-lg font-extrabold tabular-nums leading-tight ${sel ? "text-black" : "text-white"}`}>{diaMes(fecha).split(" ")[0]}</span>
              {fecha === hoy && <span className={`absolute top-1 right-1.5 text-[8px] font-extrabold ${sel ? "text-black/70" : "text-[#FF5A00]"}`}>HOY</span>}
              {conCosas && !sel && <span className="absolute left-1/2 -translate-x-1/2 bottom-1 w-1 h-1 rounded-full bg-[#FF5A00]" />}
            </button>
          );
        })}
      </div>

      <p className="text-sm font-bold text-white mb-3">{nombreDia(diaSel)} {diaMes(diaSel)}</p>

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.12] p-6 text-center text-sm text-zinc-500">
          Todavía no hay máquinas cargadas. Agregalas desde el botón “Máquinas”.
        </div>
      ) : (
        <div className="grid gap-2 items-stretch" style={{ gridTemplateColumns: "minmax(96px, 150px) 1fr 1fr" }}>
          <div />
          <CabeceraTurno turno="DIA" info={infoDe("DIA")} asigs={asigsDia.filter((a) => a.turno === "DIA")} ocupado={ocupado} onActivar={() => activar("DIA")} />
          <CabeceraTurno turno="NOCHE" info={infoDe("NOCHE")} asigs={asigsDia.filter((a) => a.turno === "NOCHE")} ocupado={ocupado} onActivar={() => activar("NOCHE")} />
          {haySinMaquina && <Fila maq={SIN_MAQUINA} />}
          {filas.map((m) => (
            <Fila key={m.id} maq={m} />
          ))}
        </div>
      )}

      <div className="flex gap-x-4 gap-y-1 flex-wrap mt-4 pt-3 border-t border-white/[0.08] text-[11px] text-zinc-500">
        {[["#FF5A00", "Planificado"], ["#38bdf8", "En tablet"], ["#FFD60A", "Cargado · por aprobar"], ["#34d399", "Aprobado"]].map(([c, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: c }} />{t}</span>
        ))}
      </div>
    </section>
  );
}
