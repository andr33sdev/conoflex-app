// Lo que cambia entre un agente y otro en la pantalla: nombre, escena 3D, ideas y cómo se resume su estado.
import { IDEAS_COMPRAS, IDEAS_RRHH, IDEAS_STOCK, propuestasCompras, propuestasDesde, propuestasStock } from "./propuestas";

export const PERFILES = {
  rrhh: {
    id: "rrhh",
    nombre: "Lía",
    inicial: "L",
    color: "#FF5A00",
    presentacion: "Soy Lía, de RRHH.",
    escena: "oficina",
    claves: { chat: "lia_chat_v2", voz: "lia_voz_v1", escena: "lia_escena_v1" },
    pdf: true,
    panorama: null,
    voz: { indice: 0, tono: 1.1, ritmo: 1 },
    revisando: (e) => `Revisé las fichadas de ${e?.operarios_revisados ?? "todos los"} operarios`,
    ideas: IDEAS_RRHH,
    propuestas: propuestasDesde,
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé las fichadas de ${estado.operarios_revisados ?? "todos los"} operarios y hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}${estado.altas ? `, ${estado.altas} urgente${estado.altas === 1 ? "" : "s"}` : ""}. Esto es lo que atendería primero:`
          : "Revisé todo y no hay nada pendiente. Podés pedirme una liquidación o preguntarme lo que necesites."
        : "Todavía no hice mi primera revisión. Podés pedirme que revise ahora o preguntarme lo que necesites.",
  },
  stock: {
    id: "stock",
    nombre: "Nati",
    inicial: "N",
    color: "#22c55e",
    presentacion: "Soy Nati, del depósito.",
    escena: "deposito",
    claves: { chat: "nati_chat_v1", voz: "nati_voz_v1", escena: "nati_escena_v1" },
    pdf: false,
    panorama: "stock",
    voz: { indice: 1, tono: 1.28, ritmo: 1.08 },
    ideas: IDEAS_STOCK,
    propuestas: propuestasStock,
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé todo el stock y hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}${estado.altas ? `, ${estado.altas} urgente${estado.altas === 1 ? "" : "s"}` : ""}. Esto es lo primero que miraría:`
          : "Revisé el depósito y no hay nada urgente. Preguntame lo que necesites."
        : "Todavía no hice mi primera revisión del depósito. Podés pedirme que revise ahora o preguntarme lo que necesites.",
  },
  compras: {
    id: "compras",
    nombre: "Vera",
    inicial: "V",
    color: "#3b82f6",
    presentacion: "Soy Vera, de compras.",
    escena: "compras",
    claves: { chat: "vera_chat_v1", voz: "vera_voz_v1", escena: "vera_escena_v1" },
    pdf: false,
    panorama: "compras",
    voz: { indice: 2, tono: 0.95, ritmo: 0.95 },
    ideas: IDEAS_COMPRAS,
    propuestas: propuestasCompras,
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé las compras y hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}${estado.altas ? `, ${estado.altas} urgente${estado.altas === 1 ? "" : "s"}` : ""}. Esto es lo primero que miraría:`
          : "Las compras están en orden. Decime qué materiales querés pedir y te armo la solicitud."
        : "Todavía no hice mi primera revisión de compras. Decime qué querés pedir y te armo la solicitud, o pedile a Nati que me pase lo que falta.",
  },
};
export const perfilDe = (id) => PERFILES[id] || PERFILES.rrhh;
