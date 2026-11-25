import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BadgeCheck, ChevronDown, FlaskConical, MessageSquareText, Moon, PackagePlus, Radio, Rocket, Sun, Trash2, Undo2 } from "lucide-react";
import { Barra, Boton, Chip, Drawer, Etiqueta } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { api, nombreDia, diaMes, num, sinSemi, turnoLabel } from "../produccion/util";
import { estadoTurno, problemasDeTurno } from "./reglas";

function Receta({ a, bloqueado, onCambio, toast }) {
  const [abierta, setAbierta] = useState(false);
  const [dato, setDato] = useState(null);
  const [error, setError] = useState("");

  const abrir = async () => {
    const siguiente = !abierta;
    setAbierta(siguiente);
    if (!siguiente || dato) return;
    try {
      setDato(await api(`/api/prod/asignaciones/${a.id}/recetas`));
    } catch (e) {
      setError(e.message);
    }
  };
  const confirmar = async (ingenieria_id) => {
    try {
      await api(`/api/prod/asignaciones/${a.id}/confirmar-receta`, { method: "PUT", body: { ingenieria_id } });
      setAbierta(false);
      setDato(null);
      toast("Receta confirmada");
      onCambio();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div>
      <button
        onClick={abrir}
        disabled={bloqueado && !a.receta_confirmada}
        className={`w-full flex items-center gap-3 rounded-xl border px-3.5 min-h-[48px] text-left transition-colors cursor-pointer ${
          a.receta_confirmada ? "border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/10" : "border-[#FFD60A]/35 bg-[#FFD60A]/[0.07] hover:bg-[#FFD60A]/[0.12]"
        }`}
      >
        {a.receta_confirmada ? <BadgeCheck size={18} className="text-emerald-400 shrink-0" /> : <FlaskConical size={18} className="text-[#FFD60A] shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-bold ${a.receta_confirmada ? "text-emerald-100" : "text-[#FFD60A]"}`}>
            {a.receta_confirmada ? `Receta confirmada · ${a.receta_version || ""}` : "Confirmar la receta antes de lanzar"}
          </span>
          {!a.ingenieria_id ? <span className="block text-xs text-rose-300">Este producto no tiene receta cargada.</span> : !a.receta_confirmada && <span className="block text-xs text-zinc-400">Define qué materias primas se descuentan del stock cuando apruebes la carga.</span>}
        </span>
        <ChevronDown size={16} className={`text-zinc-500 transition-transform ${abierta ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="pt-3 flex flex-col gap-3">
              {error && <p className="text-sm text-rose-300">{error}</p>}
              {!dato && !error && <p className="text-sm text-zinc-500">Cargando recetas…</p>}
              {dato && dato.recetas.length === 0 && <p className="text-sm text-zinc-400">Este producto no tiene recetas. Cargala primero en el módulo Ingeniería.</p>}
              {dato?.recetas.map((r) => (
                <div key={r.id} className={`rounded-xl border p-3.5 ${dato.elegida === r.id ? "border-[#FF5A00]/50 bg-[#FF5A00]/[0.05]" : "border-white/[0.07] bg-white/[0.02]"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-white text-sm">{r.version}</span>
                    {r.activa && <Chip tono="verde">Activa</Chip>}
                    {dato.elegida === r.id && !r.activa && <Chip tono="naranja">Elegida</Chip>}
                  </div>
                  {r.ingredientes.length === 0 ? (
                    <p className="text-xs text-zinc-500">Sin materias primas cargadas.</p>
                  ) : (
                    <ul className="text-[13px] divide-y divide-white/[0.05]">
                      {r.ingredientes.map((i) => (
                        <li key={i.codigo} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="text-zinc-200 min-w-0 truncate">{i.nombre} <span className="text-zinc-600">{i.codigo}</span></span>
                          <span className="text-zinc-400 tabular-nums whitespace-nowrap">{num(i.cantidad, 3)} {i.unidad_medida}/u · stock {num(i.stock_actual)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!bloqueado && (
                    <Boton variante={dato.elegida === r.id && dato.confirmada ? "suave" : "naranja"} className="mt-3" onClick={() => confirmar(r.id)}>
                      {dato.elegida === r.id && dato.confirmada ? "Mantener esta receta" : "Confirmar esta receta"}
                    </Boton>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Asignacion({ a, maquinas, operarios, bloqueado, enTablet, onCambio, toast, compacta }) {
  const [cant, setCant] = useState(String(a.cantidad));
  const [quitar, setQuitar] = useState(false);
  // Con varios productos en el turno cada uno aparece como una línea; se abre para editar o ver el detalle.
  const [abierta, setAbierta] = useState(!compacta);
  const [cantPrev, setCantPrev] = useState(a.cantidad);
  if (cantPrev !== a.cantidad) {
    setCantPrev(a.cantidad);
    setCant(String(a.cantidad));
  }
  const faltan = problemasDeTurno([a]).length;
  const maq = maquinas.find((m) => m.id === a.maquina_id)?.nombre;

  const cambiar = async (campoNombre, valor) => {
    try {
      await api(`/api/prod/asignaciones/${a.id}`, { method: "PUT", body: { [campoNombre]: valor } });
      onCambio();
    } catch (e) {
      toast(e.message, "error");
      setCant(String(a.cantidad));
    }
  };
  const confirmarCantidad = () => {
    const n = Number(cant);
    if (n === a.cantidad) return;
    if (!Number.isInteger(n) || n <= 0) {
      toast("La cantidad debe ser un entero mayor a cero.", "error");
      setCant(String(a.cantidad));
      return;
    }
    cambiar("cantidad", n);
  };
  const borrar = async () => {
    try {
      // Si ya tiene producción cargada, el aviso de abajo ya lo explicó: se confirma directamente.
      const r = await api(`/api/prod/asignaciones/${a.id}${a.real ? "?con_cargas=1" : ""}`, { method: "DELETE" });
      if (r?.cargas_eliminadas) toast(`Sacado del turno, con lo cargado${r.materiales_devueltos ? " (materia prima devuelta al stock)" : ""}.`);
      onCambio();
    } catch (e) {
      // Se cargó producción mientras estaba abierto el panel: confirmar antes de borrarla.
      if (e.status === 409 && e.datos?.tiene_cargas && window.confirm(`${e.message}\n\n¿Sacarlo igual?`)) {
        try {
          await api(`/api/prod/asignaciones/${a.id}?con_cargas=1`, { method: "DELETE" });
          onCambio();
        } catch (e2) {
          toast(e2.message, "error");
        }
      } else toast(e.message, "error");
    }
  };
  const activas = maquinas.filter((m) => m.activa);
  const opciones = operarios.includes(a.operario) || !a.operario ? operarios : [a.operario, ...operarios];

  return (
    <motion.li layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }} className="rounded-2xl border border-white/[0.08] bg-[#131317] p-3.5">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="min-w-0 flex-1 text-left cursor-pointer">
          <p className="text-[15px] font-bold text-white leading-snug"><span className="font-mono text-[11px] font-bold text-[#FFD60A] mr-2">{a.lote}</span>{sinSemi(a.semielaborado_nombre)}</p>
          <p className="text-xs text-zinc-500">
            {abierta ? a.semielaborado_codigo : (
              <>
                <span className="tabular-nums">{num(a.real ? a.real.buenas : a.cantidad)} u</span>
                {maq ? ` · ${maq}` : ""}{a.operario ? ` · ${a.operario}` : ""}
                {a.real ? " · cargado" : faltan > 0 ? <span className="text-[#FFD60A]"> · faltan datos</span> : ""}
              </>
            )}
          </p>
        </button>
        {!bloqueado && (
          <button onClick={() => setQuitar((v) => !v)} aria-label="Sacar del turno" className="w-10 h-10 grid place-items-center rounded-xl text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer">
            <Trash2 size={17} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {quitar && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-3">
              <p className="text-sm text-rose-100 flex-1">
                {a.real
                  ? `Ya tiene producción cargada (${num(a.real.buenas)} buenas, ${a.real.estado === "APROBADA" ? "aprobada" : "por aprobar"}). Si lo sacás, también se elimina lo cargado${a.real.estado === "APROBADA" ? " y se devuelve la materia prima al stock" : ""}.`
                  : "¿Sacar este lote del turno? Vuelve a la lista de la semana como pendiente de repartir."}
              </p>
              <Boton variante="peligro" onClick={borrar}>Sacar</Boton>
              <Boton variante="fantasma" onClick={() => setQuitar(false)}>No</Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {abierta && (
        <>
      {enTablet && faltan > 0 && (
        <p className="mt-3 flex items-start gap-2 text-xs text-[#FFD60A] bg-[#FFD60A]/[0.08] border border-[#FFD60A]/25 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Todavía no aparece en la tablet: completá máquina, operario y receta.
        </p>
      )}
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <div>
          <Etiqueta>Cantidad del turno</Etiqueta>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={cant}
            disabled={bloqueado}
            onChange={(e) => setCant(e.target.value)}
            onBlur={confirmarCantidad}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className={campo}
          />
        </div>
        <div>
          <Etiqueta>Máquina</Etiqueta>
          <select value={a.maquina_id || ""} disabled={bloqueado} onChange={(e) => cambiar("maquina_id", e.target.value ? Number(e.target.value) : null)} className={campo}>
            <option value="">Elegir…</option>
            {activas.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <Etiqueta>Operario</Etiqueta>
          {opciones.length ? (
            <select value={a.operario || ""} disabled={bloqueado} onChange={(e) => cambiar("operario", e.target.value)} className={campo}>
              <option value="">Elegir…</option>
              {opciones.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input defaultValue={a.operario || ""} disabled={bloqueado} onBlur={(e) => e.target.value !== (a.operario || "") && cambiar("operario", e.target.value)} placeholder="Nombre" className={campo} />
          )}
        </div>
      </div>
      {activas.length === 0 && <p className="mt-2 text-xs text-zinc-500">Todavía no hay máquinas cargadas: agregalas desde el botón “Máquinas”.</p>}

      {a.real ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-300">Lo que se hizo</p>
            <Chip tono={a.real.estado === "APROBADA" ? "verde" : "amarillo"}>{a.real.estado === "APROBADA" ? "Aprobada" : "Por aprobar"}</Chip>
          </div>
          <p className="tabular-nums">
            <span className="text-3xl font-extrabold text-white">{num(a.real.buenas)}</span>
            <span className="text-base text-zinc-400"> buenas de {num(a.cantidad)} pedidas</span>
          </p>
          <div className="mt-2"><Barra total={a.cantidad} hecho={a.real.buenas} /></div>
          <p className="mt-2 text-xs text-zinc-400">Total {num(a.real.total)} · fallas {num(a.real.fallas)} · cargó {a.real.operario}</p>
        </div>
      ) : enTablet ? (
        <p className="mt-4 text-sm text-zinc-500">Todavía no se cargó lo producido.</p>
      ) : null}

      <div className="mt-3">
        <Receta a={a} bloqueado={bloqueado} onCambio={onCambio} toast={toast} />
      </div>
        </>
      )}
    </motion.li>
  );
}

// Qué le falta a cada producto para poder activarse en la tablet (máquina, operario, receta).
function faltantesDe(a) {
  const f = [];
  if (!a.maquina_id) f.push("máquina");
  if (!a.operario) f.push("operario");
  if (!a.receta_confirmada) f.push("receta");
  return f;
}

function ParaActivar({ asigs }) {
  const pendientes = asigs.filter((a) => faltantesDe(a).length > 0);
  if (asigs.length === 0) return null;
  if (pendientes.length === 0)
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 flex items-center gap-2.5">
        <BadgeCheck size={18} className="text-emerald-400 shrink-0" />
        <p className="text-sm font-bold text-emerald-100">Todo listo para activar en la tablet.</p>
      </div>
    );
  return (
    <div className="rounded-2xl border border-[#FFD60A]/30 bg-[#FFD60A]/[0.06] p-4">
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#FFD60A] mb-2.5 flex items-center gap-2"><AlertTriangle size={14} /> Falta para activar en la tablet</p>
      <ul className="flex flex-col gap-1.5">
        {pendientes.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-zinc-200">{sinSemi(a.semielaborado_nombre)}</span>
            <span className="flex gap-1 shrink-0">
              {faltantesDe(a).map((f) => (
                <span key={f} className="text-[11px] font-bold text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/25 rounded-md px-1.5 py-0.5">{f}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-500">Abrí cada producto de arriba y completá lo que falta.</p>
    </div>
  );
}

// Aviso cuando la materia prima no alcanza para producir lo planificado en el turno.
function AvisoMateriales({ faltantes }) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.07] p-4">
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-rose-300 mb-2.5 flex items-center gap-2"><AlertTriangle size={14} /> No alcanza la materia prima</p>
      <ul className="flex flex-col gap-1.5">
        {faltantes.map((m) => (
          <li key={m.codigo} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-zinc-200">{m.nombre}</span>
            <span className="shrink-0 tabular-nums text-rose-200">faltan {num(m.falta, 2)} {m.unidad}</span>
            <span className="shrink-0 tabular-nums text-zinc-500 text-xs">hay {num(m.stock, 2)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-500">Igual podés activar, pero conviene reponer antes o bajar la cantidad para no frenar la máquina.</p>
    </div>
  );
}

// Un renglón de la lista de la semana para sumar al turno, con su cantidad.
function ItemParaAgregar({ it, onAgregar, ocupado }) {
  const restante = Math.max(0, it.cantidad_semana - it.asignado);
  const [cant, setCant] = useState(restante > 0 ? String(restante) : "");
  const completo = restante <= 0;
  return (
    <li className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${completo ? "border-white/[0.05] bg-white/[0.015]" : "border-white/[0.07] bg-[#131317]"}`}>
      <span className="font-mono text-[11px] font-bold text-[#FFD60A] shrink-0">{it.lote}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold truncate ${completo ? "text-zinc-400" : "text-white"}`}>{sinSemi(it.nombre)}</span>
        <span className={`block text-[11px] tabular-nums ${completo ? "text-zinc-600" : "text-zinc-500"}`}>{completo ? "ya repartido" : `faltan ${num(restante)} de ${num(it.cantidad_semana)}`}</span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        min="1"
        value={cant}
        onChange={(e) => setCant(e.target.value)}
        placeholder="cant."
        aria-label={`Cantidad de ${sinSemi(it.nombre)} para este turno`}
        className="w-20 min-h-[40px] rounded-lg bg-black/30 border border-white/[0.12] px-2.5 text-sm text-white text-center tabular-nums focus:outline-none focus:border-[#FF5A00]/70"
      />
      <Boton variante={completo ? "fantasma" : "primario"} onClick={() => onAgregar(it, Number(cant))} disabled={ocupado || !(Number(cant) > 0)} icono={PackagePlus} className="!min-h-[40px] !px-3">Sumar</Boton>
    </li>
  );
}

export default function PanelTurno({ turnoAbierto, plan, maquinas, operarios, onCerrar, onCambio, toast }) {
  const [ocupado, setOcupado] = useState(false);
  const fecha = turnoAbierto?.fecha;
  const turno = turnoAbierto?.turno;
  const abierto = !!turnoAbierto && !!plan;

  const info = abierto ? plan.turnos.find((t) => t.fecha === fecha && t.turno === turno) : null;
  const asigs = abierto ? plan.asignaciones.filter((a) => a.fecha === fecha && a.turno === turno) : [];
  const lanzado = !!info?.lanzado;
  const sin = !!info?.sin_produccion;
  const problemas = problemasDeTurno(asigs);
  const est = estadoTurno(info, asigs);

  // Chequeo de materia prima para el turno (se rehace si cambian cantidades o recetas).
  const [materiales, setMateriales] = useState(null);
  const firmaAsigs = asigs.map((a) => `${a.id}:${a.cantidad}:${a.receta_confirmada ? 1 : 0}:${a.ingenieria_id || 0}`).join("|");
  useEffect(() => {
    if (!abierto || lanzado || sin || asigs.length === 0) { setMateriales(null); return; }
    let vivo = true;
    api(`/api/prod/turnos/materiales?fecha=${fecha}&turno=${turno}`).then((d) => vivo && setMateriales(d)).catch(() => vivo && setMateriales(null));
    return () => { vivo = false; };
  }, [abierto, fecha, turno, lanzado, sin, firmaAsigs]);

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

  const marcarSin = (valor) => llamar(() => api("/api/prod/turnos", { method: "PUT", body: { fecha, turno, sin_produccion: valor, motivo: "" } }));
  const agregar = (item, cantidad) => {
    const restante = Math.max(0, item.cantidad_semana - item.asignado);
    const cant = Number(cantidad) > 0 ? Number(cantidad) : restante > 0 ? restante : item.cantidad_semana;
    return llamar(() => api("/api/prod/asignaciones", { method: "POST", body: { item_id: item.id, fecha, turno, cantidad: cant } }));
  };
  const lanzar = () => llamar(() => api("/api/prod/turnos/lanzar", { method: "POST", body: { fecha, turno } }), "Activado: ya aparece en la tablet de planta");
  const retirar = () => llamar(() => api("/api/prod/turnos/retirar", { method: "POST", body: { fecha, turno } }), "Turno retirado de la tablet");

  const Icono = turno === "NOCHE" ? Moon : Sun;

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={abierto ? `${nombreDia(fecha)} ${diaMes(fecha)}` : ""}
      subtitulo={abierto && (
        <span className="inline-flex items-center gap-2">
          <Icono size={15} className={turno === "NOCHE" ? "text-sky-300" : "text-[#FFD60A]"} /> Turno {turnoLabel(turno).toLowerCase()} <Chip tono={est.tono}>{est.texto}</Chip>
        </span>
      )}
      pie={abierto && !sin && (
        lanzado ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-emerald-200 leading-snug"><Radio size={14} className="inline mr-1.5 -mt-0.5" />Está en la tablet. Podés agregar, cambiar o sacar productos: se ve al instante en planta.</p>
            {!asigs.some((x) => x.real) && <Boton variante="suave" icono={Undo2} onClick={retirar} disabled={ocupado}>Retirar de la tablet</Boton>}
          </div>
        ) : (
          <div>
            {asigs.length > 0 && problemas.length > 0 && (
              <p className="mb-3 text-xs text-[#FFD60A]/90 text-center">Faltan datos en {asigs.filter((x) => problemasDeTurno([x]).length).length} de {asigs.length} productos (ver arriba).</p>
            )}
            <Boton variante="primario" grande className="w-full" icono={Rocket} onClick={lanzar} disabled={ocupado || asigs.length === 0 || problemas.length > 0}>
              Activar en tablet
            </Boton>
            {asigs.length > 0 && problemas.length === 0 && <p className="mt-2 text-xs text-zinc-400 text-center leading-snug">Aparece en la tablet de planta y los operarios cargan lo producido. Después lo podés seguir cambiando.</p>}
          </div>
        )
      )}
    >
      {abierto && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-zinc-300 leading-snug">{est.ayuda}</p>
          {(sin || asigs.length === 0) && <div className={`rounded-2xl border p-3.5 ${sin ? "border-white/[0.15] bg-white/[0.04]" : "border-white/[0.07] bg-white/[0.02]"}`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-bold text-white">No hay producción en este turno</p>
                <p className="text-xs text-zinc-500">Si lo activás, la tablet muestra que no se produce y el turno no se puede lanzar.</p>
              </div>
              <button
                role="switch"
                aria-checked={sin}
                aria-label="Sin producción en este turno"
                disabled={ocupado || lanzado || (!sin && asigs.length > 0)}
                onClick={() => marcarSin(!sin)}
                className={`relative w-14 h-8 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sin ? "bg-[#FF5A00]" : "bg-white/[0.12]"}`}
              >
                <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${sin ? "translate-x-6" : ""}`} />
              </button>
            </div>
            {sin && (
              <div className="mt-3">
                <Etiqueta>Motivo (opcional)</Etiqueta>
                <input
                  defaultValue={info?.motivo || ""}
                  disabled={lanzado}
                  onBlur={(e) => e.target.value !== (info?.motivo || "") && llamar(() => api("/api/prod/turnos", { method: "PUT", body: { fecha, turno, sin_produccion: true, motivo: e.target.value } }))}
                  placeholder="Ej: feriado, mantenimiento, falta de personal"
                  className={campo}
                />
              </div>
            )}
          </div>}

          {info?.comentario && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-sky-300 flex items-center gap-2"><MessageSquareText size={14} /> Comentario del turno{info.comentario_por ? ` · ${info.comentario_por}` : ""}</p>
              <p className="mt-1.5 text-base text-white whitespace-pre-wrap">{info.comentario}</p>
            </div>
          )}

          {!sin && (
            <>
              {asigs.length > 0 && (
                <ul className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {asigs.map((a) => (
                      <Asignacion key={a.id} a={a} maquinas={maquinas} operarios={operarios} bloqueado={false} enTablet={lanzado} onCambio={onCambio} toast={toast} compacta={asigs.length > 2} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              {!lanzado && asigs.length > 0 && <ParaActivar asigs={asigs} />}
              {!lanzado && materiales && materiales.faltantes.length > 0 && <AvisoMateriales faltantes={materiales.faltantes} />}

              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-[0.1em] text-zinc-400 mb-2.5 flex items-center gap-2"><PackagePlus size={15} /> Agregar un producto al turno</h3>
                {plan.items.length === 0 ? (
                  <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-white/[0.1] p-4">La lista de la semana está vacía. Cerrá este panel y agregá lo que se va a producir.</p>
                ) : (
                  <>
                    <ul className="flex flex-col gap-2">
                      {[...plan.items].sort((a, b) => (b.cantidad_semana - b.asignado) - (a.cantidad_semana - a.asignado)).map((it) => (
                        <ItemParaAgregar key={it.id} it={it} ocupado={ocupado} onAgregar={agregar} />
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-zinc-600 leading-snug">Elegí la cantidad que va en este turno y tocá “Sumar”. Un mismo producto puede ir en varios turnos o varias veces en la misma máquina.</p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
