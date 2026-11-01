// Lo que cambia entre un agente y otro: nombre, voz, qué panel extra tiene y cómo se resume su estado.

const aviso = (n, altas) => `${n} ${n === 1 ? "aviso abierto" : "avisos abiertos"}${altas ? `, ${altas} urgente${altas === 1 ? "" : "s"}` : ""}`;

export const PERFILES = {
  rrhh: {
    id: "rrhh",
    nombre: "Lía",
    claves: { chat: "lia_chat_v2", voz: "lia_voz_v1" },
    panorama: null,
    personal: true,
    voz: { indice: 0, tono: 1.1, ritmo: 1 },
    presentacion: "Soy Lía, de RRHH.",
    reporte: "Armame un reporte de RRHH para pasar a PDF: estado de los avisos abiertos, fichadas y presentismo que haya que revisar, y qué atender primero. Con títulos y viñetas.",
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé las fichadas de ${estado.operarios_revisados ?? "todos los"} operarios y hay ${aviso(abiertos, estado.altas)}.`
          : "Revisé todo y no hay nada pendiente."
        : "Todavía no hice mi primera revisión.",
  },
  stock: {
    id: "stock",
    nombre: "Nati",
    claves: { chat: "nati_chat_v1", voz: "nati_voz_v1" },
    panorama: "stock",
    voz: { indice: 1, tono: 1.28, ritmo: 1.08 },
    presentacion: "Soy Nati, del depósito.",
    reporte: "Armame un reporte del depósito para pasar a PDF: materias primas y semielaborados críticos o bajos, compras e internos pendientes, y qué conviene pedir o fabricar primero. Con títulos y una tabla.",
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé todo el stock y hay ${aviso(abiertos, estado.altas)}.`
          : "Revisé el depósito y no hay nada urgente."
        : "Todavía no hice mi primera revisión del depósito.",
  },
  compras: {
    id: "compras",
    nombre: "Vera",
    claves: { chat: "vera_chat_v1", voz: "vera_voz_v1" },
    panorama: "compras",
    voz: { indice: 2, tono: 0.95, ritmo: 0.95 },
    presentacion: "Soy Vera, de compras.",
    reporte: "Armame un reporte de compras para pasar a PDF: la lista en armado, solicitudes sin firma, entregas demoradas y proveedores que incumplen. Con títulos y viñetas.",
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé las compras y hay ${aviso(abiertos, estado.altas)}.`
          : "Las compras están en orden."
        : "Todavía no hice mi primera revisión de compras.",
  },
  produccion: {
    id: "produccion",
    nombre: "Romi",
    claves: { chat: "maru_chat_v1", voz: "maru_voz_v1" },
    panorama: "produccion",
    sinVigilante: true,
    voz: { indice: 3, tono: 1.12, ritmo: 1.04 },
    presentacion: "Soy Romi, de producción.",
    reporte: "Armame un reporte de producción para pasar a PDF: qué conviene fabricar primero y por qué, pedidos abiertos más atrasados, avance del plan de la semana y gente en planta. Con títulos y una tabla.",
    resumen: (estado, abiertos) => (abiertos > 0 ? `Tengo ${aviso(abiertos, estado?.altas)}.` : "Preguntame qué conviene fabricar primero."),
  },
  ventas: {
    id: "ventas",
    nombre: "Cami",
    claves: { chat: "cami_chat_v1", voz: "cami_voz_v1" },
    panorama: "ventas",
    voz: { indice: 4, tono: 1.18, ritmo: 1.06 },
    presentacion: "Soy Cami, de ventas.",
    reporte: "Armame un reporte de ventas para pasar a PDF: mails de clientes sin responder, borradores listos para revisar, qué se corrigió en los últimos envíos, qué reglas comerciales tengo anotadas y qué cosas me falta definir para mejorar (preguntas que se repiten, características pedidas). Con títulos y viñetas.",
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé tus mails etiquetados y hay ${aviso(abiertos, estado.altas)}.`
          : "Revisé tus mails etiquetados y no hay nada esperándote."
        : "Todavía no hice mi primera revisión de mails.",
  },
  seguimiento: {
    id: "seguimiento",
    nombre: "Sofi",
    claves: { chat: "sofi_chat_v1", voz: "sofi_voz_v1" },
    panorama: "seguimiento",
    voz: { indice: 6, tono: 1.1, ritmo: 1.0 },
    presentacion: "Soy Sofi, de seguimiento de mails.",
    reporte: "Armame un reporte de seguimiento para pasar a PDF: presupuestos y consultas enviados que siguen sin respuesta, cuántos días llevan, cuáles se enfriaron y cuáles rebotaron. Con títulos y una tabla.",
    resumen: (estado, abiertos) =>
      estado?.ultima_revision
        ? abiertos > 0
          ? `Revisé tus mails enviados y hay ${aviso(abiertos, estado.altas)}.`
          : "Revisé tus mails enviados y nadie te debe una respuesta."
        : "Todavía no hice mi primera revisión de enviados.",
  },
};
export const perfilDe = (id) => PERFILES[id] || PERFILES.rrhh;