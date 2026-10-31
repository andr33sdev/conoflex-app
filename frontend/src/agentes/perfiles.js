// Lo que cambia entre un agente y otro en la pantalla: nombre, escena 3D, ideas y cómo se resume su estado.
import { IDEAS_RRHH, IDEAS_STOCK, propuestasDesde, propuestasStock } from "./propuestas";

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
    panorama: false,
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
    panorama: true,
    ideas: IDEAS_STOCK,
    propuestas: propuestasStock,
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé todo el stock y hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}${estado.altas ? `, ${estado.altas} urgente${estado.altas === 1 ? "" : "s"}` : ""}. Esto es lo primero que miraría:`
          : "Revisé el depósito y no hay nada urgente. Preguntame lo que necesites."
        : "Todavía no hice mi primera revisión del depósito. Podés pedirme que revise ahora o preguntarme lo que necesites.",
  },
};
export const perfilDe = (id) => PERFILES[id] || PERFILES.rrhh;
