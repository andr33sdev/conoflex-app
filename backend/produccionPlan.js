"use strict";
// Plan de producción semanal + producción por turno + carga desde la tablet de planta.
//
// Flujo:
//   1. El jefe de producción arma la LISTA SEMANAL (cada renglón tiene un número de lote), a partir de
//      sugerencias (demanda, stock del semielaborado, materia prima disponible) o a mano.
//   2. Para cada día y turno (DÍA / NOCHE) toma renglones de la lista: define cantidad del día, máquina,
//      operario y confirma la receta. Un turno puede marcarse "sin producción".
//   3. Al LANZAR el turno, aparece en la tablet de planta.
//   4. Al terminar el turno el operario carga lo producido (queda PENDIENTE).
//   5. El jefe aprueba la carga: se registra en métricas y se descuenta la materia prima según la receta.

const TURNOS = ["DIA", "NOCHE"];

const redondear = (n, d = 1) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
const entero = (v) => Math.round(Number(v));
const pad = (n, l = 2) => String(n).padStart(l, "0");

// ---------------------------------------------------------------------------
// Fechas (siempre "YYYY-MM-DD", sin zonas horarias)
// ---------------------------------------------------------------------------
function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // descarta fechas imposibles como 2026-02-31
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}
const aISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function sumarDias(iso, dias) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + dias);
  return aISO(d);
}

/** Lunes de la semana que contiene la fecha. */
function lunesDe(iso) {
  const d = parseISO(iso);
  if (!d) return null;
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return aISO(d);
}

/** Semana ISO 8601 { anio, semana } (el año ISO puede diferir del calendario en fin/inicio de año). */
function semanaISO(iso) {
  const d = parseISO(iso);
  if (!d) return null;
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // jueves de esa semana
  const anio = d.getUTCFullYear();
  const primero = new Date(Date.UTC(anio, 0, 4));
  const semana = 1 + Math.round(((d - primero) / 86400000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7);
  return { anio, semana };
}

/** Número de lote: L + año(2) + semana(2) + "-" + secuencia(3). Ej: L2644-001 */
function generarLote(lunesISO, secuencia) {
  const s = semanaISO(lunesISO);
  if (!s) throw new Error("Fecha de semana inválida");
  return `L${pad(s.anio % 100)}${pad(s.semana)}-${pad(secuencia, 3)}`;
}

/** Secuencia siguiente dentro de la semana a partir de los lotes ya existentes. */
function siguienteSecuencia(lotesExistentes) {
  let max = 0;
  for (const l of lotesExistentes || []) {
    const m = /-(\d+)$/.exec(String(l || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// ---------------------------------------------------------------------------
// Sugerencias de producción
// ---------------------------------------------------------------------------
/**
 *  demanda:  [{ id, codigo, nombre, demanda_mensual, stock_total }]   (de demandaSemielaborados)
 *  planificado: { [semielaborado_id]: cantidad ya en la lista de esa semana }
 *  recetas:  { [semielaborado_id]: { ingenieria_id, version, ingredientes: [{ mp_id, codigo, nombre, cantidad, stock }] } }
 *  coberturaDias: cuántos días de demanda se quiere dejar cubiertos con el stock
 */
function sugerirProduccion({ demanda, planificado = {}, recetas = {}, coberturaDias = 30, diasCritico = 5, diasAlerta = 15 }) {
  const salida = [];
  for (const f of demanda || []) {
    const mensual = Number(f.demanda_mensual) || 0;
    if (mensual <= 0) continue;
    const diaria = mensual / 30;
    const stock = Math.max(0, Number(f.stock_total) || 0);
    const necesidad = Math.max(0, Math.ceil(diaria * coberturaDias - stock));
    const yaPlan = Number(planificado[f.id]) || 0;
    const pendiente = Math.max(0, necesidad - yaPlan);
    if (pendiente <= 0) continue;

    const diasDeStock = diaria > 0 ? redondear(stock / diaria, 1) : null;
    const urgencia = diasDeStock == null ? "NORMAL" : diasDeStock <= diasCritico ? "CRITICA" : diasDeStock <= diasAlerta ? "ALTA" : "NORMAL";

    const receta = recetas[f.id] || null;
    let material = { estado: "SIN_RECETA", producible: null, limita: null };
    if (receta && receta.ingredientes && receta.ingredientes.length) {
      let min = Infinity;
      let limita = null;
      for (const ing of receta.ingredientes) {
        const c = Number(ing.cantidad) || 0;
        if (c <= 0) continue;
        const p = Math.floor(Math.max(0, Number(ing.stock) || 0) / c);
        if (p < min) {
          min = p;
          limita = { codigo: ing.codigo, nombre: ing.nombre, stock: Number(ing.stock) || 0 };
        }
      }
      if (min !== Infinity) {
        material = { estado: min >= pendiente ? "ALCANZA" : "INSUFICIENTE", producible: min, limita };
      } else {
        material = { estado: "SIN_RECETA", producible: null, limita: null };
      }
    }

    salida.push({
      semielaborado_id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      demanda_mensual: redondear(mensual, 1),
      stock_total: stock,
      dias_de_stock: diasDeStock,
      urgencia,
      cantidad_sugerida: pendiente,
      ya_planificado: yaPlan,
      material,
    });
  }
  const peso = { CRITICA: 0, ALTA: 1, NORMAL: 2 };
  salida.sort((a, b) => peso[a.urgencia] - peso[b.urgencia] || (a.dias_de_stock ?? 1e9) - (b.dias_de_stock ?? 1e9));
  return salida;
}

// ---------------------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------------------
/** Problemas que impiden lanzar un turno a la tablet. */
function validarLanzamiento(turno, asignaciones) {
  const problemas = [];
  if (turno && Number(turno.sin_produccion)) {
    problemas.push("El turno está marcado como \"sin producción\": no hay nada para lanzar.");
    return problemas;
  }
  if (!asignaciones || !asignaciones.length) {
    problemas.push("El turno no tiene producción asignada.");
    return problemas;
  }
  for (const a of asignaciones) {
    const quien = `${a.lote || "Renglón"} · ${a.semielaborado_nombre || a.semielaborado_codigo || ""}`.trim();
    if (!a.maquina_id) problemas.push(`${quien}: falta la máquina.`);
    if (!(Number(a.cantidad) > 0)) problemas.push(`${quien}: falta la cantidad del turno.`);
    if (!String(a.operario || "").trim()) problemas.push(`${quien}: falta el operario.`);
    if (!Number(a.receta_confirmada)) problemas.push(`${quien}: falta confirmar la receta.`);
  }
  return problemas;
}

/** Asignaciones del mismo turno sobre la misma máquina (aviso, no bloquea). */
function detectarChoques(asignaciones) {
  const porClave = new Map();
  for (const a of asignaciones || []) {
    if (!a.maquina_id) continue;
    const k = `${a.fecha}|${a.turno}|${a.maquina_id}`;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(a.id);
  }
  return [...porClave.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => {
    const [fecha, turno, maquina_id] = k.split("|");
    return { fecha, turno, maquina_id: Number(maquina_id), asignaciones: ids };
  });
}

/** Valida y normaliza lo que carga el operario. Devuelve { error } o { valores }. */
function validarCarga(body) {
  const num = (v) => (v === "" || v == null ? NaN : Number(v));
  const total = num(body.total_producido);
  const fallas = body.fallas === "" || body.fallas == null ? 0 : num(body.fallas);
  const ciclos = body.ciclos === "" || body.ciclos == null ? 0 : num(body.ciclos);
  const kg = body.kg_por_producto === "" || body.kg_por_producto == null ? 0 : num(body.kg_por_producto);
  if (!Number.isFinite(total) || total <= 0) return { error: "Indicá el total producido." };
  if (!Number.isInteger(total)) return { error: "El total producido debe ser un número entero." };
  if (!Number.isFinite(fallas) || fallas < 0 || !Number.isInteger(fallas)) return { error: "Las fallas deben ser un número entero (0 si no hubo)." };
  if (fallas > total) return { error: "Las fallas no pueden ser más que el total producido." };
  if (!Number.isFinite(ciclos) || ciclos < 0 || !Number.isInteger(ciclos)) return { error: "Los ciclos deben ser un número entero." };
  if (!Number.isFinite(kg) || kg < 0) return { error: "Los kg por producto no son válidos." };
  return {
    valores: {
      total_producido: total,
      fallas,
      ciclos,
      kg_por_producto: kg,
      color: String(body.color || "").trim().slice(0, 100),
      codigo_material: String(body.codigo_material || "").trim().slice(0, 255),
      observaciones: String(body.observaciones || "").trim().slice(0, 2000),
    },
  };
}

/**
 * Efectos de aprobar una carga.
 *  - "Total producido" son todas las piezas que salieron de la máquina; las fallas están dentro de ese total.
 *  - Piezas buenas = total - fallas.
 *  - La materia prima se consume por TODAS las piezas (las falladas también gastaron material).
 *  ingredientes: [{ mp_id, codigo, nombre, cantidad (por unidad), unidad }]
 */
function calcularEfectosCarga({ total_producido, fallas, kg_por_producto }, ingredientes) {
  const total = Number(total_producido) || 0;
  const f = Number(fallas) || 0;
  const kg = Number(kg_por_producto) || 0;
  return {
    buenas: total - f,
    kg_total: redondear(kg * total, 3),
    kg_fallas: redondear(kg * f, 3),
    consumos: (ingredientes || [])
      .filter((i) => Number(i.cantidad) > 0)
      .map((i) => ({
        mp_id: i.mp_id,
        codigo: i.codigo,
        nombre: i.nombre,
        unidad: i.unidad || "Kg",
        cantidad: redondear(Number(i.cantidad) * total, 4),
      })),
  };
}

module.exports = {
  TURNOS,
  parseISO,
  sumarDias,
  lunesDe,
  semanaISO,
  generarLote,
  siguienteSecuencia,
  sugerirProduccion,
  validarLanzamiento,
  detectarChoques,
  validarCarga,
  calcularEfectosCarga,
  entero,
};
