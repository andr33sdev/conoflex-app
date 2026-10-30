import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BadgeCheck, ChevronDown, FlaskConical, Lock, Moon, PackagePlus, Rocket, Sun, Trash2, Undo2 } from "lucide-react";
import { Boton, Chip, Drawer, Etiqueta } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { api, nombreDia, diaMes, num, turnoLabel } from "../produccion/util";
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
          {!a.ingenieria_id && <span className="block text-xs text-rose-300">Este producto no tiene receta cargada.</span>}
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

function Asignacion({ a, maquinas, operarios, bloqueado, choque, onCambio, toast }) {
  const [cant, setCant] = useState(String(a.cantidad));
  const [quitar, setQuitar] = useState(false);

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
      await api(`/api/prod/asignaciones/${a.id}`, { method: "DELETE" });
      onCambio();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const activas = maquinas.filter((m) => m.activa);
  const opciones = operarios.includes(a.operario) || !a.operario ? operarios : [a.operario, ...operarios];

  return (
    <motion.li layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }} className="rounded-2xl border border-white/[0.08] bg-[#131317] p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[12px] font-bold text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/25 rounded-lg px-2 py-0.5">{a.lote}</span>
          <p className="mt-2 text-base font-bold text-white leading-snug">{a.semielaborado_nombre}</p>
          <p className="text-xs text-zinc-500">{a.semielaborado_codigo}</p>
        </div>
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
              <p className="text-sm text-rose-100 flex-1">¿Sacar este lote del turno?</p>
              <Boton variante="peligro" onClick={borrar}>Sacar</Boton>
              <Boton variante="fantasma" onClick={() => setQuitar(false)}>No</Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {choque && (
        <p className="mt-3 flex items-start gap-2 text-xs text-[#FFD60A] bg-[#FFD60A]/[0.08] border border-[#FFD60A]/25 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Hay otra producción en esta misma máquina y turno.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
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

      <div className="mt-4">
        <Receta a={a} bloqueado={bloqueado} onCambio={onCambio} toast={toast} />
      </div>
    </motion.li>
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
  const idsChoque = new Set(abierto ? plan.choques.filter((c) => c.fecha === fecha && c.turno === turno).flatMap((c) => c.asignaciones) : []);

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
  const agregar = (item) => {
    const restante = Math.max(0, item.cantidad_semana - item.asignado);
    return llamar(() => api("/api/prod/asignaciones", { method: "POST", body: { item_id: item.id, fecha, turno, cantidad: restante > 0 ? restante : item.cantidad_semana } }));
  };
  const lanzar = () => llamar(() => api("/api/prod/turnos/lanzar", { method: "POST", body: { fecha, turno } }), "Turno lanzado: ya aparece en la tablet de planta");
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
            <p className="flex-1 flex items-center gap-2 text-sm text-emerald-200"><Lock size={15} /> Ya está en la tablet. Para cambiarlo, retiralo primero.</p>
            <Boton variante="suave" icono={Undo2} onClick={retirar} disabled={ocupado}>Retirar de la tablet</Boton>
          </div>
        ) : (
          <div>
            {asigs.length > 0 && problemas.length > 0 && (
              <ul className="mb-3 text-xs text-[#FFD60A]/90 space-y-0.5 max-h-24 overflow-y-auto">
                {problemas.slice(0, 4).map((p) => (
                  <li key={p}>• {p}</li>
                ))}
                {problemas.length > 4 && <li>• y {problemas.length - 4} más…</li>}
              </ul>
            )}
            <Boton variante="primario" grande className="w-full" icono={Rocket} onClick={lanzar} disabled={ocupado || asigs.length === 0 || problemas.length > 0}>
              Lanzar a la tablet
            </Boton>
          </div>
        )
      )}
    >
      {abierto && (
        <div className="flex flex-col gap-5">
          <div className={`rounded-2xl border p-4 ${sin ? "border-white/[0.15] bg-white/[0.04]" : "border-white/[0.07] bg-white/[0.02]"}`}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-bold text-white">No hay producción en este turno</p>
                <p className="text-xs text-zinc-500">La tablet va a mostrar que no se produce.</p>
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
            {!sin && asigs.length > 0 && <p className="mt-2 text-xs text-zinc-500">Para marcarlo sin producción, primero sacá lo que tiene asignado.</p>}
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
          </div>

          {!sin && (
            <>
              {asigs.length > 0 && (
                <ul className="flex flex-col gap-4">
                  <AnimatePresence initial={false}>
                    {asigs.map((a) => (
                      <Asignacion key={`${a.id}-${a.cantidad}`} a={a} maquinas={maquinas} operarios={operarios} bloqueado={lanzado} choque={idsChoque.has(a.id)} onCambio={onCambio} toast={toast} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              {!lanzado && (
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.1em] text-zinc-400 mb-2.5 flex items-center gap-2"><PackagePlus size={15} /> Tomar de la lista de la semana</h3>
                  {plan.items.length === 0 ? (
                    <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-white/[0.1] p-4">La lista de la semana está vacía. Cerrá este panel y agregá lo que se va a producir.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {plan.items.map((it) => {
                        const restante = it.cantidad_semana - it.asignado;
                        return (
                          <li key={it.id}>
                            <button onClick={() => agregar(it)} disabled={ocupado} className="w-full text-left flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#131317] hover:border-[#FF5A00]/50 px-4 py-3 transition-colors cursor-pointer disabled:opacity-50">
                              <span className="font-mono text-[11px] font-bold text-[#FFD60A]">{it.lote}</span>
                              <span className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{it.nombre}</span>
                              <span className={`text-xs tabular-nums whitespace-nowrap ${restante > 0 ? "text-zinc-400" : "text-zinc-600"}`}>{restante > 0 ? `faltan ${num(restante)}` : "completo"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
