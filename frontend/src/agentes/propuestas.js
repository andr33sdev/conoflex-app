// Propuestas de Lía a partir de lo que realmente tiene abierto (sin IA, sin tokens).
import { fechaCorta } from "./formato";

const mesDe = (fecha) => String(fecha || "").slice(0, 7);
const quincenaDe = (fecha) => (Number(String(fecha || "").slice(8, 10)) <= 15 ? 1 : 2);

export function propuestasDesde(hallazgos = []) {
  const out = [];
  for (const h of hallazgos) {
    if (out.length >= 4) break;
    const op = h.operario;
    switch (h.tipo) {
      case "CIERRE_QUINCENA":
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "Liquidar ahora", pregunta: `Liquidá la ${quincenaDe(h.fecha) === 1 ? "primera" : "segunda"} quincena de ${mesDe(h.fecha)} para todos los operarios.` });
        break;
      case "PRESENTISMO_PERDIDO":
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "Ver las llegadas tarde", pregunta: `Contame qué días llegó tarde ${op} este mes y qué pasa con su presentismo.` });
        break;
      case "PRESENTISMO_RIESGO":
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "¿A quién más le pasa?", pregunta: "¿Qué operarios están por perder el presentismo este mes?" });
        break;
      case "SIN_SALIDA":
      case "SIN_INGRESO":
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "Qué impacto tiene", pregunta: `${op} no tiene ${h.tipo === "SIN_SALIDA" ? "fichada de salida" : "fichada de ingreso"} el ${fechaCorta(h.fecha)}. ¿Cómo afecta a la liquidación y qué tengo que corregir?` });
        break;
      case "FERIADO":
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "Cómo se paga", pregunta: `${h.titulo}. ¿Cómo se liquida ese día si alguien trabaja?` });
        break;
      case "POSIBLE_FALTA":
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "Justificar", abrirAvisos: true });
        break;
      default:
        out.push({ id: h.id, tipo: h.tipo, titulo: h.titulo, boton: "Verlo", abrirAvisos: true });
    }
  }
  return out;
}

export function saludoSegunHora(nombre) {
  const h = new Date().getHours();
  const base = h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  return nombre ? `${base}, ${String(nombre).split(" ")[0]}` : base;
}

export const IDEAS_COMPRAS = [
  "Armame la lista con lo que hace falta comprar",
  "¿Qué tengo en la lista de compra ahora?",
  "¿Qué proveedores me están fallando?",
  "¿Qué solicitudes esperan firma?",
  "¿Qué pedidos a proveedores todavía no llegaron?",
  "Dejá la lista lista para firmar",
];

/** Propuestas de Vera a partir de sus avisos abiertos (sin IA, sin tokens). */
export function propuestasCompras(hallazgos = []) {
  const out = [];
  for (const h of hallazgos) {
    if (out.length >= 4) break;
    const base = { id: h.id, tipo: h.tipo, titulo: h.titulo };
    switch (h.tipo) {
      case "SOLICITUD_SIN_FIRMA":
        out.push({ ...base, boton: "Ver firmas", pregunta: "¿Qué solicitudes de compra están esperando firma y hace cuánto?" });
        break;
      case "RENGLONES_DEMORADOS":
        out.push({ ...base, boton: "Ver qué falta", pregunta: `${h.titulo}. Contame qué es lo que falta recibir de ese proveedor.` });
        break;
      case "PROVEEDOR_INCUMPLE":
        out.push({ ...base, boton: "Ver proveedor", pregunta: `Contame la historia de ${h.operario}: qué se le compra y cuánto cumplió.` });
        break;
      case "LISTA_ABIERTA":
        out.push({ ...base, boton: "Ver la lista", pregunta: "Mostrame la lista de compra que tengo en armado." });
        break;
      default:
        out.push({ ...base, boton: "Verlo", abrirAvisos: true });
    }
  }
  return out;
}

export const IDEAS_RRHH = [
  "¿Quién hizo más horas extra este mes?",
  "Liquidame la quincena en curso de todo el plantel",
  "¿Qué operarios llegaron tarde esta semana?",
  "¿Cuántas horas me cuesta un turno de noche en fin de semana?",
  "¿Cuándo es el próximo feriado y cómo se paga?",
  "¿Quién tiene más faltas o llegadas tarde este mes?",
  "Mostrame solo las horas extra de toda la plantilla de este mes",
  "Simulá un turno de sábado de 22 a 6 para un operario",
];
export const IDEAS_STOCK = [
  "¿Qué materias primas se me acaban antes de que llegue la próxima compra?",
  "¿Qué tengo que fabricar esta semana?",
  "¿Qué tengo de más y está parado?",
  "Armame un plan de compra para el próximo mes",
  "¿Qué compras pedidas todavía no llegaron?",
  "Pasale a Vera lo que hay que comprar",
  "¿Qué pedidos internos esperan hace más tiempo?",
  "¿Cuál es el semielaborado con menos días de stock?",
];

/** Propuestas de Nati a partir de sus hallazgos abiertos (sin IA, sin tokens). */
export function propuestasStock(hallazgos = []) {
  const out = [];
  for (const h of hallazgos) {
    if (out.length >= 4) break;
    const base = { id: h.id, tipo: h.tipo, titulo: h.titulo };
    switch (h.tipo) {
      case "MP_CRITICA":
      case "STOCK_NEGATIVO":
        out.push({ ...base, boton: "Qué hago", pregunta: `${h.titulo}. ¿Cuánto me conviene pedir y qué productos se ven afectados?` });
        break;
      case "MP_BAJA":
        out.push({ ...base, boton: "Cuánto pedir", pregunta: `${h.titulo}. ¿Cuánto debería comprar para cubrir el próximo mes?` });
        break;
      case "SEMI_CRITICO":
      case "SEMI_BAJO":
        out.push({ ...base, boton: "Qué fabricar", pregunta: `${h.titulo}. ¿Cuánto hay que fabricar y en qué depósito está?` });
        break;
      case "COMPRA_DEMORADA":
      case "INTERNA_DEMORADA":
        out.push({ ...base, boton: "Ver el detalle", pregunta: `${h.titulo}. Contame el detalle y qué conviene hacer.` });
        break;
      case "MP_EXCESO":
        out.push({ ...base, boton: "Ver el exceso", pregunta: `${h.titulo}. ¿Cuánto capital tengo parado y qué conviene hacer?` });
        break;
      default:
        out.push({ ...base, boton: "Verlo", abrirAvisos: true });
    }
  }
  return out;
}
