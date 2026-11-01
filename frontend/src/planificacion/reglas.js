// Mismas reglas que valida el servidor al lanzar (el servidor es quien decide de verdad).
export function problemasDeTurno(asigs) {
  const p = [];
  for (const a of asigs) {
    const q = `${a.lote} · ${a.semielaborado_nombre}`;
    if (!a.maquina_id) p.push(`${q}: falta la máquina.`);
    if (!(Number(a.cantidad) > 0)) p.push(`${q}: falta la cantidad.`);
    if (!String(a.operario || "").trim()) p.push(`${q}: falta el operario.`);
    if (!a.receta_confirmada) p.push(`${q}: falta confirmar la receta.`);
  }
  return p;
}

// Cada estado de un turno, con una frase que explica qué significa y qué sigue.
export function estadoTurno(info, asigs) {
  if (info?.lanzado) {
    const hechas = asigs.filter((a) => a.real).length;
    if (asigs.length && hechas === asigs.length) return { tono: "verde", texto: "Cargado", ayuda: "Ya se cargó todo lo producido en este turno." };
    if (hechas > 0) return { tono: "amarillo", texto: `Cargado ${hechas}/${asigs.length}`, ayuda: "Faltan cargar algunas producciones desde la tablet." };
    return { tono: "azul", texto: "En tablet", ayuda: "Está en la tablet de planta: los operarios van a cargar lo producido. Mientras esté ahí no se puede editar." };
  }
  if (info?.sin_produccion) return { tono: "gris", texto: "Sin producción", ayuda: "La tablet va a mostrar que en este turno no se produce." };
  if (!asigs.length) return { tono: "gris", texto: "Sin armar", ayuda: "Todavía no tiene nada asignado. Tomá lotes de la lista de la semana." };
  return problemasDeTurno(asigs).length
    ? { tono: "amarillo", texto: "Faltan datos", ayuda: "Completá máquina, operario y receta de cada lote para poder lanzarlo." }
    : { tono: "naranja", texto: "Listo para lanzar", ayuda: "Está todo completo. Al lanzarlo aparece en la tablet de planta." };
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nombreDiaISO = (iso) => DIAS[new Date(`${iso}T12:00:00`).getDay()];

/**
 * Qué conviene hacer ahora, en una frase, con lo que pasa si se hace.
 * Devuelve { paso (1-4 o 5 si todo está al día), titulo, ayuda, accion? } donde accion es
 * { texto, tipo: "agregar" | "cargas" | "turno", fecha?, turno? }.
 */
export function proximoPaso(plan, hoy) {
  const items = plan?.items || [];
  const asigs = plan?.asignaciones || [];
  const turnos = plan?.turnos || [];
  if (!items.length) {
    return { paso: 1, titulo: "Agregá lo que se va a producir esta semana", ayuda: "Armás la lista de lo que hay que fabricar. Todavía no se mueve nada en planta.", accion: { texto: "Agregar a la lista", tipo: "agregar" } };
  }
  const pendientes = Number(plan?.cargas_pendientes) || 0;
  if (pendientes > 0) {
    return { paso: 4, titulo: `Hay ${pendientes} ${pendientes === 1 ? "carga" : "cargas"} por aprobar`, ayuda: "Al aprobarlas se suman a las métricas y se descuenta la materia prima del stock.", accion: { texto: "Revisar cargas", tipo: "cargas" } };
  }
  const claves = [...new Set(asigs.map((a) => `${a.fecha}|${a.turno}`))].sort();
  const sinLanzar = claves
    .map((k) => k.split("|"))
    .filter(([fecha, turno]) => fecha >= hoy && !turnos.find((t) => t.fecha === fecha && t.turno === turno)?.lanzado);
  const listo = sinLanzar.find(([fecha, turno]) => problemasDeTurno(asigs.filter((a) => a.fecha === fecha && a.turno === turno)).length === 0);
  const nombre = (f, t) => `${nombreDiaISO(f)} ${f === hoy ? "(hoy) " : ""}de ${t === "NOCHE" ? "noche" : "día"}`;
  if (listo) {
    return { paso: 3, titulo: `El turno del ${nombre(listo[0], listo[1])} está listo para lanzar`, ayuda: "Al lanzarlo aparece en la tablet de planta y los operarios ya pueden cargar lo producido. Después no se puede editar.", accion: { texto: "Abrir el turno", tipo: "turno", fecha: listo[0], turno: listo[1] } };
  }
  if (sinLanzar.length) {
    const [f, t] = sinLanzar[0];
    return { paso: 2, titulo: `Al turno del ${nombre(f, t)} le faltan datos`, ayuda: "Falta la máquina, el operario o confirmar la receta. Sin eso no se puede lanzar a la tablet.", accion: { texto: "Completar el turno", tipo: "turno", fecha: f, turno: t } };
  }
  const sinRepartir = items.reduce((n, i) => n + Math.max(0, i.cantidad_semana - i.asignado), 0);
  if (sinRepartir > 0) {
    return { paso: 2, titulo: `Faltan repartir ${sinRepartir.toLocaleString("es-AR")} unidades en turnos`, ayuda: "Cada lote se reparte en días, turnos y máquinas." };
  }
  return { paso: 5, titulo: "Todo al día", ayuda: "Lo planificado ya está repartido, lanzado o producido." };
}
