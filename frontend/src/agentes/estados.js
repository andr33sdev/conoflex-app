import { useSyncExternalStore } from "react";

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
};

const MODOS = {
  pensando: (n) => A(`${n} está pensando tu consulta`, "engranaje", "arriba"),
  hablando: (n) => A(`${n} te está contestando`, "onda"),
  escuchando: (n) => A(`${n} te está escuchando`, "mic"),
  revisando: (n) => A(`${n} está haciendo una revisión`, "lupa", "scan"),
};

const SEGUNDOS = 9;

/**
 * Estado actual de un agente. `abiertos` suma una actividad "con N avisos" a la rotación.
 * La rotación depende del reloj de pared, así que lista y cabecera muestran lo mismo.
 */
export function estadoDe(id, nombre, { modo = "idle", abiertos = 0, ahora = Date.now() } = {}) {
  if (MODOS[modo]) return { ...MODOS[modo](nombre), modo };
  const base = ACTIVIDADES[id];
  if (!base) return { texto: "En preparación", icono: null, ojos: "frente", modo: "idle", dormido: true };
  const lista = abiertos > 0 ? [...base.slice(0, 4), A(`Atendiendo ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}`, "carpeta", "abajo"), ...base.slice(4)] : base;
  const semilla = id === "rrhh" ? 0 : id === "stock" ? 3 : 5;
  const slot = Math.floor(ahora / (SEGUNDOS * 1000));
  const a = lista[(slot * 5 + semilla) % lista.length];
  return { ...a, modo: "idle" };
}

const slotAhora = () => Math.floor(Date.now() / (SEGUNDOS * 1000));
const suscribirSlot = (fn) => {
  const id = setInterval(fn, 1000);
  return () => clearInterval(id);
};
/** Re-renderiza solo cuando toca cambiar de actividad (no en cada cuadro de animación). */
export const useSlotEstado = () => useSyncExternalStore(suscribirSlot, slotAhora, () => 0);
