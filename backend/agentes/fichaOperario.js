"use strict";
// Ficha por operario (la usa Lía y la pestaña "Personal"): historial de un año, mes por mes, con horas normales y
// extra, días trabajados, llegadas tarde y presentismo. No calcula nada nuevo: junta lo que ya devuelve liquidarDesdeBD.
const { liquidarDesdeBD } = require("../liquidacionDb");

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Operarios con fichadas en el año (más los del año anterior, por si recién arranca enero). */
async function listarOperarios(pool, anio) {
  const [rows] = await pool.query(
    "SELECT nombre, COUNT(*) AS fichadas, MAX(fecha_hora) AS ultima FROM fichadas WHERE fecha_hora >= ? AND fecha_hora < ? GROUP BY nombre ORDER BY nombre",
    [`${anio}-01-01`, `${anio + 1}-01-01`],
  );
  return rows.map((r) => ({ nombre: r.nombre, fichadas: Number(r.fichadas) }));
}

/**
 * Junta los resultados de liquidarDesdeBD (uno por mes del año) en una ficha.
 * `porMes` es un arreglo de 12 posiciones: el resultado de ese mes, null si falló o { error } si no hay fichadas.
 */
function armarFicha(operario, anio, porMes, { hastaMes = 12 } = {}) {
  const meses = [];
  const tardes = [];
  for (let i = 0; i < 12; i++) {
    const mes = `${anio}-${String(i + 1).padStart(2, "0")}`;
    const r = porMes[i];
    if (i + 1 > hastaMes) continue;
    if (!r || r.error) {
      meses.push({ mes, nombre: MESES[i], con_datos: false, horas_normales: 0, horas_extra: 0, dias: 0, llegadas_tarde: 0, pierde_presentismo: false });
      continue;
    }
    const pm = (r.presentismo?.meses || []).find((m) => m.mes === mes);
    const lt = pm ? pm.llegadas_tarde : [];
    for (const l of lt) tardes.push({ fecha: l.fecha, dia: l.dia, ingreso: l.ingreso, minutos_tarde: l.minutos_tarde, turno: l.turno });
    meses.push({
      mes,
      nombre: MESES[i],
      con_datos: true,
      horas_normales: r2(r.horas_normales),
      horas_extra: r2(r.horas_extra),
      dias: Array.isArray(r.dias) ? r.dias.length : Number(r.turnos_liquidados) || 0,
      llegadas_tarde: lt.length,
      pierde_presentismo: !!pm?.pierde_presentismo_del_mes,
      sin_salida: Array.isArray(r.dias) ? r.dias.filter((d) => d.sin_salida).length : 0,
    });
  }
  const con = meses.filter((m) => m.con_datos);
  const suma = (k) => r2(meses.reduce((a, m) => a + m[k], 0));
  return {
    operario,
    anio,
    resumen: {
      meses_con_datos: con.length,
      horas_normales: suma("horas_normales"),
      horas_extra: suma("horas_extra"),
      dias_trabajados: meses.reduce((a, m) => a + m.dias, 0),
      llegadas_tarde: tardes.length,
      meses_sin_presentismo: meses.filter((m) => m.pierde_presentismo).map((m) => m.nombre),
      fichadas_sin_salida: meses.reduce((a, m) => a + (m.sin_salida || 0), 0),
      promedio_extra_por_mes: con.length ? r2(suma("horas_extra") / con.length) : 0,
    },
    meses,
    llegadas_tarde: tardes.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40),
  };
}

/** Ficha de un operario en un año. `operario` es el nombre (o parte); si coincide con varios devuelve el error con las opciones. */
async function fichaOperario(pool, { operario, anio, ahora = new Date() } = {}) {
  const y = Number.isInteger(Number(anio)) && Number(anio) > 2000 ? Number(anio) : ahora.getFullYear();
  const hastaMes = y === ahora.getFullYear() ? ahora.getMonth() + 1 : 12;
  if (!operario) return { error: "Falta indicar el operario." };
  const porMes = new Array(12).fill(null);
  let nombre = null;
  for (let i = 0; i < hastaMes; i++) {
    const mes = `${y}-${String(i + 1).padStart(2, "0")}`;
    const r = await liquidarDesdeBD(pool, { operario: nombre || operario, mes, detalle: "compacto" }).catch((e) => ({ error: e.message }));
    if (r?.coincidencias) return { error: r.error, coincidencias: r.coincidencias };
    if (r && !r.error && r.operario) nombre = r.operario;
    porMes[i] = r;
  }
  if (!nombre) return { error: `No encuentro fichadas de "${operario}" en ${y}.` };
  return armarFicha(nombre, y, porMes, { hastaMes });
}

module.exports = { listarOperarios, armarFicha, fichaOperario, MESES };
