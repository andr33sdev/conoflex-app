"use strict";
// Carga de datos (fichadas, feriados, ajustes, escala de valor hora) y liquidación.
const { liquidarPeriodo, liquidarTurno, redondear, REGLAS, CATEGORIAS, DIAS } = require("./liquidacion");

const sinAcentos = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const pad = (n) => String(n).padStart(2, "0");
const RE_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fechaDe = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d ? f : null; // rechaza 2026-02-31
};
const ultimoDiaDelMes = (mes) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

/**
 * Resuelve qué fechas hay que liquidar. Todas las puntas son INCLUSIVE.
 * Prioridad: fechas sueltas > desde/hasta > mes + quincena > mes completo.
 *   quincena 1 = del 1 al 15; quincena 2 = del 16 al último día del mes.
 */
function resolverFechas({ fechas, desde, hasta, mes, quincena }) {
  if (Array.isArray(fechas) && fechas.length) {
    const set = new Set();
    for (const f of fechas.slice(0, 62)) {
      if (!RE_FECHA.test(String(f)) || !fechaDe(String(f))) return { error: `Fecha inválida: "${f}". Usá AAAA-MM-DD.` };
      set.add(String(f));
    }
    const orden = [...set].sort();
    return { fechas: set, desde: orden[0], hasta: orden[orden.length - 1], descripcion: `días ${orden.join(", ")}`, sueltas: true };
  }
  let d1, d2, desc;
  if (desde || hasta) {
    d1 = String(desde || hasta);
    d2 = String(hasta || desde);
    if (!RE_FECHA.test(d1) || !fechaDe(d1) || !RE_FECHA.test(d2) || !fechaDe(d2)) {
      return { error: "desde y hasta deben tener formato AAAA-MM-DD." };
    }
    if (d1 > d2) return { error: "'desde' no puede ser posterior a 'hasta'." };
    desc = d1 === d2 ? `el día ${d1}` : `del ${d1} al ${d2} (ambos inclusive)`;
  } else if (mes) {
    if (!RE_MES.test(String(mes))) return { error: "El mes debe tener formato AAAA-MM (por ejemplo 2026-10)." };
    const q = quincena === undefined || quincena === null || quincena === "" ? null : Number(quincena);
    if (q !== null && q !== 1 && q !== 2) return { error: "quincena debe ser 1 (del 1 al 15) o 2 (del 16 al fin de mes)." };
    const ult = ultimoDiaDelMes(mes);
    if (q === 1) { d1 = `${mes}-01`; d2 = `${mes}-15`; desc = `primera quincena de ${mes} (del 1 al 15, ambos inclusive)`; }
    else if (q === 2) { d1 = `${mes}-16`; d2 = `${mes}-${pad(ult)}`; desc = `segunda quincena de ${mes} (del 16 al ${ult}, ambos inclusive)`; }
    else { d1 = `${mes}-01`; d2 = `${mes}-${pad(ult)}`; desc = `mes completo ${mes} (del 1 al ${ult})`; }
  } else {
    return { error: "Indicá qué liquidar: 'mes' (con 'quincena' opcional), 'desde'/'hasta' o 'fechas'." };
  }
  const set = new Set();
  for (let f = fechaDe(d1); iso(f) <= d2; f = new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1)) {
    set.add(iso(f));
    if (set.size > 400) return { error: "El rango es demasiado largo (máximo 400 días)." };
  }
  return { fechas: set, desde: d1, hasta: d2, descripcion: desc, sueltas: false };
}

/** Elige el período de la escala: el del mes, o el último anterior, o el más nuevo. */
function elegirPeriodo(periodos, mes) {
  const lista = periodos.map((p) => p.periodo).sort();
  if (lista.includes(mes)) return mes;
  const anteriores = lista.filter((p) => p <= mes);
  return anteriores.length ? anteriores[anteriores.length - 1] : lista[lista.length - 1] || null;
}

function margen(desde, hasta) {
  const a = fechaDe(desde);
  const b = fechaDe(hasta);
  const ini = new Date(a.getFullYear(), a.getMonth(), a.getDate() - 2);
  const fin = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 3);
  return { ini: `${iso(ini)} 00:00:00`, fin: `${iso(fin)} 00:00:00` };
}

async function cargarContexto(pool) {
  const [feriadosRows] = await pool.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, descripcion FROM fichero_feriados");
  const [ajustesRows] = await pool.query(
    "SELECT nombre_operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora_inicio_pactada, '%H:%i') AS hora_inicio_pactada, horas_normales, todas_extra FROM fichero_ajustes_dias",
  );
  const [asigRows] = await pool.query("SELECT nombre_operario, categoria_codigo FROM fichero_operarios_categorias");
  const [catRows] = await pool.query("SELECT codigo, nombre FROM fichero_uoyep_categorias");
  const [perRows] = await pool.query("SELECT periodo, label FROM fichero_uoyep_periodos");
  const [valRows] = await pool.query("SELECT categoria_codigo, periodo, valor_hora, suma_no_remunerativa FROM fichero_uoyep_valores");
  return {
    feriados: new Map(feriadosRows.map((r) => [r.fecha, r.descripcion || ""])),
    ajustes: ajustesRows,
    asignaciones: new Map(asigRows.map((a) => [a.nombre_operario, a.categoria_codigo])),
    categorias: new Map(catRows.map((c) => [c.codigo, c.nombre])),
    periodos: perRows,
    valores: valRows,
  };
}

/** valorHoraDe(fecha) para una categoría: usa el período de la escala del mes de esa fecha. */
function valorHoraPara(ctx, codigo, periodosUsados) {
  return (fecha) => {
    if (!codigo) return 0;
    const periodo = elegirPeriodo(ctx.periodos, fecha.slice(0, 7));
    if (!periodo) return 0;
    periodosUsados.add(periodo);
    const v = ctx.valores.find((x) => x.categoria_codigo === codigo && x.periodo === periodo);
    return v ? Number(v.valor_hora) : 0;
  };
}

function ajustesDe(ctx, nombre) {
  const out = {};
  for (const a of ctx.ajustes) {
    if (a.nombre_operario !== nombre) continue;
    out[a.fecha] = {
      horaInicio: a.hora_inicio_pactada || null,
      horasNormales: a.horas_normales != null ? Number(a.horas_normales) : null,
      todasExtra: !!a.todas_extra,
    };
  }
  return out;
}

const NOTA_REGLAS =
  "Reglas de Conoflex: hora diurna 06:00–21:00, nocturna 21:00–06:00 con +13,33%; jornada normal de 9 hs desde el ingreso, el resto es extra al 50% (sobre la hora diurna o nocturna que corresponda); sábados desde las 13:00, domingos y feriados todo es extra al 100%; sin tope de horas extra. Cada minuto se clasifica por su fecha y hora reales y cada turno se asigna al día en que ingresó. Las horas se calculan al minuto, sin redondeos.";

async function liquidarDesdeBD(pool, { operario, mes, quincena, desde, hasta, fechas, detalle } = {}) {
  const rango = resolverFechas({ fechas, desde, hasta, mes, quincena });
  if (rango.error) return { error: rango.error };

  const { ini, fin } = margen(rango.desde, rango.hasta);
  const [filas] = await pool.query(
    "SELECT nombre, tipo, fecha_hora FROM fichadas WHERE fecha_hora >= ? AND fecha_hora < ? ORDER BY fecha_hora",
    [ini, fin],
  );
  const nombres = [...new Set(filas.map((f) => f.nombre))].sort();

  let elegidos = nombres;
  if (operario) {
    const q = sinAcentos(operario);
    const exactos = nombres.filter((n) => sinAcentos(n) === q);
    const coinciden = exactos.length ? exactos : nombres.filter((n) => sinAcentos(n).includes(q));
    if (!coinciden.length) {
      return { error: `No hay fichadas de "${operario}" en ${rango.descripcion}.`, operarios_con_fichadas: nombres.slice(0, 60) };
    }
    if (coinciden.length > 1) {
      return { error: `"${operario}" coincide con varios operarios. Indicá cuál.`, coincidencias: coinciden };
    }
    elegidos = coinciden;
  }
  if (!elegidos.length) return { error: `No hay fichadas en ${rango.descripcion}.` };

  const ctx = await cargarContexto(pool);
  const periodosUsados = new Set();
  const modoDetalle = detalle === "compacto" || detalle === "completo"
    ? detalle
    : operario && rango.fechas.size <= 8 ? "completo" : "compacto";

  const resultados = elegidos.map((nombre) => {
    const codigo = ctx.asignaciones.get(nombre) || null;
    const liq = liquidarPeriodo({
      fichadas: filas.filter((f) => f.nombre === nombre),
      fechasIncluidas: rango.fechas,
      feriados: new Set(ctx.feriados.keys()),
      ajustes: ajustesDe(ctx, nombre),
      valorHoraDe: valorHoraPara(ctx, codigo, periodosUsados),
      detalle: operario ? modoDetalle : "compacto",
    });
    const sinValor = !codigo || (liq.importe_total === 0 && liq.horas_totales > 0);
    return {
      operario: nombre,
      categoria: codigo ? ctx.categorias.get(codigo) || codigo : "SIN CATEGORÍA ASIGNADA",
      ...liq,
      ...(sinValor ? { aviso_importes: "El operario no tiene categoría asignada o la escala no tiene valor de hora para el período: los importes salen en 0 (las horas sí están calculadas)." } : {}),
    };
  });

  const feriadosEnRango = [...ctx.feriados.entries()]
    .filter(([f]) => f >= rango.desde && f <= rango.hasta)
    .map(([f, d]) => `${f}${d ? " (" + d + ")" : ""}`);

  const base = {
    liquidacion_de: rango.descripcion,
    modo_detalle: operario ? modoDetalle : "resumen por operario",
    periodos_de_escala_usados: [...periodosUsados].sort(),
    feriados_en_el_rango: feriadosEnRango,
    reglas: NOTA_REGLAS,
  };
  if (operario) {
    const r = resultados[0];
    return { ...base, ...r, valor_hora_diurno: valorReferencia(ctx, ctx.asignaciones.get(r.operario), rango.hasta) };
  }
  const resumen = resultados.map((r) => {
    const { dias, ...resto } = r;
    return { ...resto, dias_con_turno: dias.length };
  });
  return {
    ...base,
    operarios: resumen,
    total_importe: redondear(resultados.reduce((a, r) => a + r.importe_total, 0)),
  };
}

function valorReferencia(ctx, codigo, fecha) {
  if (!codigo) return null;
  const periodo = elegirPeriodo(ctx.periodos, fecha.slice(0, 7));
  const v = ctx.valores.find((x) => x.categoria_codigo === codigo && x.periodo === periodo);
  return v ? Number(v.valor_hora) : null;
}

/**
 * Simula UN turno hipotético con el mismo motor: "si entra el sábado 7 a las 22 y sale a las 6,
 * ¿cuánto cobra?". Usa valor_hora o la categoría de un operario.
 */
async function simularTurno(pool, { fecha, entrada, salida, valor_hora, operario, feriado, horas_normales, todas_extra } = {}) {
  if (!RE_FECHA.test(String(fecha || "")) || !fechaDe(String(fecha))) return { error: "fecha debe ser AAAA-MM-DD." };
  const re = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  if (!re.test(String(entrada || "")) || !re.test(String(salida || ""))) return { error: "entrada y salida deben ser HH:MM (24 hs)." };
  const [y, m, d] = String(fecha).split("-").map(Number);
  const [eh, em] = entrada.split(":").map(Number);
  const [sh, sm] = salida.split(":").map(Number);
  const entradaTs = new Date(y, m - 1, d, eh, em).getTime();
  let salidaTs = new Date(y, m - 1, d, sh, sm).getTime();
  if (salidaTs <= entradaTs) salidaTs += 24 * 3600000; // cruza la medianoche

  const ctx = await cargarContexto(pool);
  let vh = Number(valor_hora) || 0;
  let categoria = null;
  if (operario) {
    const nombres = [...ctx.asignaciones.keys()];
    const q = sinAcentos(operario);
    const hit = nombres.filter((n) => sinAcentos(n).includes(q));
    if (hit.length !== 1) return { error: hit.length ? `"${operario}" coincide con varios operarios: ${hit.join(", ")}.` : `No encuentro al operario "${operario}" con categoría asignada.` };
    const codigo = ctx.asignaciones.get(hit[0]);
    categoria = `${hit[0]} – ${ctx.categorias.get(codigo) || codigo}`;
    vh = valorReferencia(ctx, codigo, fecha) || 0;
  }
  if (!(vh > 0)) return { error: "Falta el valor hora: pasá valor_hora o un operario con categoría y escala cargada." };

  const feriadosSet = new Set(ctx.feriados.keys());
  if (feriado) feriadosSet.add(String(fecha));
  const liq = liquidarTurno({
    entradaTs, salidaTs, esFeriado: (f) => feriadosSet.has(f),
    ajuste: { horaInicio: null, horasNormales: horas_normales ? Number(horas_normales) : null, todasExtra: !!todas_extra },
    valorHora: vh,
  });
  return {
    fecha, dia: DIAS[new Date(y, m - 1, d).getDay()], entrada, salida,
    feriado: feriadosSet.has(String(fecha)) || undefined,
    ...(categoria ? { categoria } : {}),
    valor_hora_diurno: vh,
    horas_totales: liq.horasTotales,
    desglose: liq.segmentos,
    por_categoria: Object.fromEntries(Object.entries(liq.porCategoria).map(([k, v]) => [k, { horas: v.horas, importe: v.importe }])),
    importe_total: liq.importe,
    reglas: NOTA_REGLAS,
  };
}

module.exports = { liquidarDesdeBD, simularTurno, resolverFechas, elegirPeriodo, REGLAS, CATEGORIAS };
