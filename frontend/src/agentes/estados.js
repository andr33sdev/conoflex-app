import { useSyncExternalStore } from "react";
import { escena, ORDEN } from "./escena";

// Qué está haciendo cada agente. Rota solo cada pocos segundos para que el equipo se sienta vivo,
// y cambia en el acto cuando conversás con él (escucha, piensa, habla).
// ojos: hacia dónde mira el personaje (frente, scan, abajo, arriba, cafe, lado).

const A = (texto, icono, ojos = "frente") => ({ texto, icono, ojos });

export const ACTIVIDADES = {
  rrhh: [
    A("Revisando las fichadas del día", "lupa", "scan"),
    A("Pasando en limpio las horas de la quincena", "doc", "abajo"),
    A("Controlando el presentismo", "tilde", "scan"),
    A("Mirando el calendario de feriados", "calendario", "lado"),
    A("Preparando una liquidación", "calculadora", "abajo"),
    A("Ordenando legajos", "carpeta", "abajo"),
    A("Revisando turnos de la semana", "reloj", "lado"),
    A("Tomando un café", "taza", "cafe"),
    A("Esperando tu consulta", "puntos"),
  ],
  stock: [
    A("Contando stock en el depósito", "caja", "scan"),
    A("Revisando materias primas", "lupa", "scan"),
    A("Controlando los semielaborados", "lista", "abajo"),
    A("Anotando los consumos del mes", "doc", "abajo"),
    A("Esperando un camión de proveedor", "camion", "lado"),
    A("Mirando la curva de consumo", "grafico", "lado"),
    A("Acomodando estanterías", "caja", "lado"),
    A("Tomando un café", "taza", "cafe"),
    A("Esperando tu consulta", "puntos"),
  ],
  compras: [
    A("Armando la lista de compras", "lista", "abajo"),
    A("Llamando a un proveedor", "telefono", "lado"),
    A("Comparando precios", "calculadora", "abajo"),
    A("Esperando una firma", "lapiz", "abajo"),
    A("Siguiendo una entrega", "camion", "lado"),
    A("Revisando cotizaciones", "doc", "scan"),
    A("Viendo cómo cumple cada proveedor", "grafico", "scan"),
    A("Tomando un té", "taza", "cafe"),
    A("Esperando tu consulta", "puntos"),
  ],
  produccion: [
    A("Revisando los pedidos abiertos", "lista", "scan"),
    A("Cruzando pedidos con el stock", "grafico", "abajo"),
    A("Armando el plan de la semana", "calendario", "abajo"),
    A("Viendo quién está en planta", "reloj", "lado"),
    A("Decidiendo qué se fabrica primero", "engranaje", "arriba"),
    A("Siguiendo el avance de los lotes", "caja", "scan"),
    A("Mirando las máquinas", "engranaje", "lado"),
    A("Tomando un café", "taza", "cafe"),
    A("Esperando tu consulta", "puntos"),
  ],
};

const MODOS = {
  pensando: (n) => A(`${n} está pensando tu consulta`, "engranaje", "arriba"),
  hablando: (n) => A(`${n} te está contestando`, "onda"),
  escuchando: (n) => A(`${n} te está escuchando`, "mic"),
  revisando: (n) => A(`${n} está haciendo una revisión`, "lupa", "scan"),
};

const SEGUNDOS = 9;

// Quiénes están en el equipo de esta persona (según sus permisos): el mapa y los estados hablan solo de ellos.
let EQUIPO = { ids: ORDEN.slice(), nombres: { rrhh: "Lía", stock: "Nati", compras: "Vera", produccion: "Romi" } };
export function setEquipo(agentes = []) {
  const ids = ORDEN.filter((id) => agentes.some((a) => a.id === id));
  EQUIPO = { ids, nombres: { ...EQUIPO.nombres, ...Object.fromEntries(agentes.map((a) => [a.id, a.nombre])) } };
}
export const equipoIds = () => EQUIPO.ids;
const nombreDe = (id) => EQUIPO.nombres[id] || "un compañero";

/** Estado que sale de lo que está pasando en el departamento (caminar, visitar, recibir, café). null si está en su escritorio. */
function estadoEscena(id, e) {
  if (!e || e.fase === "escritorio") return null;
  const con = nombreDe(e.con);
  if (e.fase === "sale") return e.con === "cafe" ? A("Yendo a tomar un café", "pasos", "lado") : A(`Yendo a ver a ${con}`, "pasos", "lado");
  if (e.fase === "vuelve") return A("Volviendo a su escritorio", "pasos", "lado");
  if (e.fase === "cafe") return A("Tomando un café en la cocina", "taza", "cafe");
  if (e.fase === "visita") return { ...A(`Charlando con ${con}`, "chat", "frente"), modo: "hablando" };
  if (e.fase === "recibe") return { ...A(`Recibiendo a ${con}`, "chat", "frente"), modo: "escuchando" };
  return null;
}

/**
 * Estado actual de un agente. `abiertos` suma una actividad "con N avisos" a la rotación.
 * La rotación depende del reloj de pared, así que lista y cabecera muestran lo mismo.
 */
export function estadoDe(id, nombre, { modo = "idle", abiertos = 0, ahora = Date.now() } = {}) {
  if (MODOS[modo]) return { ...MODOS[modo](nombre), modo };
  const base = ACTIVIDADES[id];
  if (!base) return { texto: "En preparación", icono: null, ojos: "frente", modo: "idle", dormido: true };
  const salida = estadoEscena(id, escena(ahora, EQUIPO.ids)[id]);
  if (salida) return { modo: "idle", ...salida };
  const lista = abiertos > 0 ? [...base.slice(0, 4), A(`Atendiendo ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}`, "carpeta", "abajo"), ...base.slice(4)] : base;
  const semilla = { rrhh: 0, stock: 3, compras: 5, produccion: 7 }[id] ?? 0;
  const slot = Math.floor(ahora / (SEGUNDOS * 1000));
  const a = lista[(slot * 5 + semilla) % lista.length];
  return { ...a, modo: "idle" };
}

const slotAhora = () => Math.floor(Date.now() / 3000); // se re-renderiza cada 3 s: alcanza para seguir a quien camina
const suscribirSlot = (fn) => {
  const id = setInterval(fn, 1000);
  return () => clearInterval(id);
};
/** Re-renderiza solo cuando toca cambiar de actividad (no en cada cuadro de animación). */
export const useSlotEstado = () => useSyncExternalStore(suscribirSlot, slotAhora, () => 0);
