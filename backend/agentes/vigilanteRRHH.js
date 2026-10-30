"use strict";
// Vigilante de RRHH: mira fichadas, feriados y categorías y devuelve "hallazgos" (avisos). No usa IA ni tokens:
// son reglas fijas, así corre barato y siempre da lo mismo para los mismos datos.
//
//  - Presentismo (misma regla que Connie, vía presentismo.js): pérdida y riesgo (2 llegadas tarde en el mes).
//  - Feriados próximos (tabla fichero_feriados + feriados nacionales de fecha fija).
//  - Fichadas faltantes: ingreso sin salida / salida sin ingreso.
//  - Posibles faltas: un día de lunes a viernes sin fichadas de alguien que viene regularmente.
//  - Cierre de quincena y operarios que fichan sin categoría (no se les puede liquidar).
const { emparejarTurnos } = require("../liquidacion");
const { analizarPresentismo, REGLAS_PRESENTISMO } = require("../presentismo");

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const aFecha = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const sumarDias = (s, n) => {
  const d = aFecha(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const diaDe = (s) => DIAS[aFecha(s).getDay()];
const ultimoDelMes = (mes) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;

/** Feriados nacionales de fecha fija (inamovibles). Los trasladables y puentes se cargan en Control Asistencia. */
const FERIADOS_FIJOS = [
  ["01-01", "Año Nuevo"],
  ["03-24", "Día Nacional de la Memoria"],
  ["04-02", "Día del Veterano y de los Caídos en Malvinas"],
  ["05-01", "Día del Trabajador"],
  ["05-25", "Día de la Revolución de Mayo"],
  ["06-20", "Paso a la Inmortalidad del General Belgrano"],
  ["07-09", "Día de la Independencia"],
  ["12-08", "Inmaculada Concepción de María"],
  ["12-25", "Navidad"],
];

function feriadosEfectivos(feriadosTabla, desde, hasta) {
  const mapa = new Map();
  for (let y = Number(desde.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) {
    for (const [md, desc] of FERIADOS_FIJOS) mapa.set(`${y}-${md}`, desc);
  }
  for (const [f, d] of feriadosTabla) mapa.set(f, d || mapa.get(f) || "Feriado");
  return mapa;
}

const hallazgo = (h) => ({ operario: null, fecha: null, ...h });

/**
 * @param {object} p
 * @param {string} p.hoy                'YYYY-MM-DD' (Argentina)
 * @param {number} p.ahoraMs            ahora, en el mismo "reloj naive" que los turnos (ver emparejarTurnos)
 * @param {Array}  p.fichadas           { nombre, tipo, fecha_hora } de los últimos ~45 días
 * @param {Map}    p.feriados           fecha -> descripción (tabla fichero_feriados)
 * @param {Array}  p.ajustes            { nombre_operario, fecha, hora_inicio_pactada, ... }
 * @param {Map}    p.categorias         nombre -> código de categoría
 */
function analizarRRHH({ hoy, ahoraMs, fichadas, feriados = new Map(), ajustes = [], categorias = new Map() }) {
  const out = [];
  const mes = hoy.slice(0, 7);
  const desde45 = sumarDias(hoy, -45);
  const todosFeriados = feriadosEfectivos(feriados, desde45, sumarDias(hoy, 30));
  const esFeriado = (f) => todosFeriados.has(f);
  const ajustesPor = new Map();
  for (const a of ajustes) {
    if (!ajustesPor.has(a.nombre_operario)) ajustesPor.set(a.nombre_operario, new Map());
    ajustesPor.get(a.nombre_operario).set(String(a.fecha).slice(0, 10), { horaInicio: a.hora_inicio_pactada || null });
  }

  const porOperario = new Map();
  for (const f of fichadas) {
    if (!porOperario.has(f.nombre)) porOperario.set(f.nombre, []);
    porOperario.get(f.nombre).push(f);
  }

  const desde7 = sumarDias(hoy, -7);
  const desde14 = sumarDias(hoy, -14);
  const desde35 = sumarDias(hoy, -35);

  for (const [nombre, marcas] of [...porOperario.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const turnos = emparejarTurnos(marcas);
    const ajOp = ajustesPor.get(nombre) || new Map();

    // ---- Presentismo (mes en curso) ----
    const pres = analizarPresentismo({
      turnos: turnos.map((t) => ({ fecha: t.fecha, ingreso: t.ingreso })),
      esFeriado,
      getAjuste: (f) => ajOp.get(f) || null,
      desde: `${mes}-01`,
      hasta: hoy,
    });
    for (const m of pres.meses) {
      if (m.mes !== mes) continue;
      if (m.pierde_presentismo_del_mes) {
        out.push(hallazgo({
          clave: `pres-perdido:${nombre}:${m.mes}`, tipo: "PRESENTISMO_PERDIDO", severidad: "ALTA", operario: nombre, fecha: m.tercera_llegada_tarde.fecha,
          titulo: `${nombre} perdió el presentismo de ${nombreMes(m.mes)}`,
          texto: `Tuvo ${m.llegadas_tarde_en_el_mes} llegadas tarde en el mes (${m.llegadas_tarde.map((l) => `${dmy(l.fecha)} ${l.ingreso}`).join(", ")}). La tercera fue el ${diaDe(m.tercera_llegada_tarde.fecha)} ${dmy(m.tercera_llegada_tarde.fecha)} (${m.tercera_llegada_tarde.quincena === 1 ? "primera" : "segunda"} quincena).`,
        }));
      } else if (m.llegadas_tarde_en_el_mes === REGLAS_PRESENTISMO.llegadasTardePermitidasPorMes) {
        out.push(hallazgo({
          clave: `pres-riesgo:${nombre}:${m.mes}`, tipo: "PRESENTISMO_RIESGO", severidad: "MEDIA", operario: nombre, fecha: m.llegadas_tarde[m.llegadas_tarde.length - 1].fecha,
          titulo: `${nombre} está a una llegada tarde de perder el presentismo`,
          texto: `Ya tiene ${m.llegadas_tarde_en_el_mes} llegadas tarde en ${nombreMes(m.mes)} (${m.llegadas_tarde.map((l) => `${dmy(l.fecha)} ${l.ingreso}`).join(", ")}). Con una más pierde el presentismo del mes.`,
        }));
      }
    }

    // ---- Ingreso sin salida ----
    for (const t of turnos) {
      if (t.salidaTs == null && t.fecha >= desde7 && ahoraMs - t.entradaTs > 24 * 3600000) {
        out.push(hallazgo({
          clave: `sinsalida:${nombre}:${t.fecha}`, tipo: "SIN_SALIDA", severidad: "ALTA", operario: nombre, fecha: t.fecha,
          titulo: `${nombre} no fichó la salida del ${diaDe(t.fecha)} ${dmy(t.fecha)}`,
          texto: `Ingresó a las ${t.ingreso} y no hay salida registrada. Sin la salida no se pueden liquidar sus horas de ese día: hay que corregir la fichada en Control Asistencia.`,
        }));
      }
    }

    // ---- Salida sin ingreso ----
    const ordenadas = [...marcas].sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
    const salidasCierre = new Set(turnos.filter((t) => t.salidaTs != null).map((t) => t.salidaTs));
    const entradasTs = new Set(turnos.map((t) => t.entradaTs));
    let previaMs = null;
    for (const f of ordenadas) {
      const ts = new Date(f.fecha_hora).getTime();
      const esToqueDoble = previaMs != null && ts - previaMs < 3 * 60 * 1000;
      if (!esToqueDoble) {
        const dia = iso(new Date(f.fecha_hora));
        if (f.tipo === "SALIDA" && dia >= desde7 && !salidasCierre.has(ts) && !entradasTs.has(ts)) {
          const hora = `${pad(new Date(f.fecha_hora).getHours())}:${pad(new Date(f.fecha_hora).getMinutes())}`;
          out.push(hallazgo({
            clave: `sinentrada:${nombre}:${dia}`, tipo: "SIN_INGRESO", severidad: "ALTA", operario: nombre, fecha: dia,
            titulo: `${nombre} no fichó el ingreso el ${diaDe(dia)} ${dmy(dia)}`,
            texto: `Hay una salida a las ${hora} sin ingreso previo. Hay que cargar o corregir la fichada de entrada para poder liquidar ese día.`,
          }));
        }
        previaMs = ts;
      }
    }

    // ---- Posibles faltas ----
    const fechasConTurno = new Set(turnos.map((t) => t.fecha));
    const fechasConMarca = new Set(marcas.map((f) => iso(new Date(f.fecha_hora)))); // una salida suelta ya se avisa como "sin ingreso"
    const tuvoActividadReciente = turnos.some((t) => t.fecha >= desde14);
    const laborables = (d1, d2) => {
      const lista = [];
      for (let f = d1; f <= d2; f = sumarDias(f, 1)) {
        const dow = aFecha(f).getDay();
        if (dow >= 1 && dow <= 5 && !esFeriado(f)) lista.push(f);
      }
      return lista;
    };
    const base = laborables(desde35, sumarDias(desde7, -1));
    const trabajadosBase = base.filter((f) => fechasConTurno.has(f)).length;
    const regular = base.length >= 10 && trabajadosBase / base.length >= 0.6;
    if (regular && tuvoActividadReciente) {
      for (const f of laborables(desde7, sumarDias(hoy, -1))) {
        if (!fechasConTurno.has(f) && !fechasConMarca.has(f) && !ajOp.has(f)) {
          out.push(hallazgo({
            clave: `falta:${nombre}:${f}`, tipo: "POSIBLE_FALTA", severidad: "MEDIA", operario: nombre, fecha: f,
            titulo: `${nombre} no tiene fichadas el ${diaDe(f)} ${dmy(f)}`,
            texto: `Es un día laborable y no hay ingreso registrado, aunque viene fichando con regularidad. Si la falta está justificada (certificado médico, aviso, licencia, trámite), acordate de justificarla; si no, corresponde descontarla.`,
          }));
        }
      }
    }

    // ---- Fichan sin categoría ----
    if (!categorias.get(nombre) && turnos.some((t) => t.fecha >= desde14)) {
      out.push(hallazgo({
        clave: `sincat:${nombre}`, tipo: "SIN_CATEGORIA", severidad: "MEDIA", operario: nombre,
        titulo: `${nombre} ficha pero no tiene categoría`,
        texto: "Sin categoría asignada no hay valor hora: sus horas se calculan pero el importe a liquidar sale en $0. Asignásela en Control Asistencia.",
      }));
    }
  }

  // ---- Feriados próximos (14 días) ----
  for (let i = 1; i <= 14; i++) {
    const f = sumarDias(hoy, i);
    if (todosFeriados.has(f)) {
      out.push(hallazgo({
        clave: `feriado:${f}`, tipo: "FERIADO", severidad: i <= 3 ? "MEDIA" : "BAJA", fecha: f,
        titulo: `Feriado el ${diaDe(f)} ${dmy(f)}: ${todosFeriados.get(f)}`,
        texto: `Faltan ${i} ${i === 1 ? "día" : "días"}. Si se trabaja, todas las horas de ese día se liquidan como extra al 100%. Conviene avisar al personal y definir los turnos.`,
      }));
    }
  }

  // ---- Cierre de quincena ----
  const dia = Number(hoy.slice(8, 10));
  const ult = ultimoDelMes(mes);
  if (dia >= 15 && dia <= 17) {
    out.push(hallazgo({
      clave: `cierre:${mes}-q1`, tipo: "CIERRE_QUINCENA", severidad: "MEDIA", fecha: `${mes}-15`,
      titulo: `Cierre de la primera quincena de ${nombreMes(mes)}`,
      texto: "Ya se puede liquidar del 1 al 15. Antes de liquidar conviene revisar los avisos de fichadas faltantes y las faltas por justificar. Pedime que la liquide y te dejo el detalle por operario.",
    }));
  }
  if (dia >= ult - 1 || dia <= 3) {
    const mesCierre = dia <= 3 ? `${aFecha(sumarDias(`${mes}-01`, -1)).getFullYear()}-${pad(aFecha(sumarDias(`${mes}-01`, -1)).getMonth() + 1)}` : mes;
    out.push(hallazgo({
      clave: `cierre:${mesCierre}-q2`, tipo: "CIERRE_QUINCENA", severidad: "MEDIA", fecha: `${mesCierre}-${pad(ultimoDelMes(mesCierre))}`,
      titulo: `Cierre de la segunda quincena de ${nombreMes(mesCierre)}`,
      texto: "Ya se puede liquidar del 16 al último día del mes. Antes de liquidar conviene revisar los avisos de fichadas faltantes y las faltas por justificar. Pedime que la liquide y te dejo el detalle por operario.",
    }));
  }

  return out;
}

/** Tipos que se cierran solos cuando el problema ya no aparece (se corrigió la fichada, pasó el feriado, etc.). */
const AUTORESOLVIBLES = new Set(["SIN_SALIDA", "SIN_INGRESO", "FERIADO", "SIN_CATEGORIA", "CIERRE_QUINCENA", "PRESENTISMO_RIESGO"]);

module.exports = { analizarRRHH, AUTORESOLVIBLES, FERIADOS_FIJOS, feriadosEfectivos };
