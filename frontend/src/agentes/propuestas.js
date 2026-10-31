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
