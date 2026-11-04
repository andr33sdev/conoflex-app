"use strict";
// Cierre de quincena: por operario, qué falta resolver antes de liquidar (salidas o ingresos sin fichar, posibles faltas,
// sin categoría) y cuánto lleva en horas. Usa el mismo análisis que Lía (analizarRRHH) pero en el momento, no el de la última revisión.
const { liquidarDesdeBD } = require("./liquidacionDb");
const { analizarRRHH } = require("./agentes/vigilanteRRHH");
const { emparejarTurnos } = require("./liquidacion");

const TIPOS = { SIN_SALIDA: "Falta la salida", SIN_INGRESO: "Falta el ingreso", POSIBLE_FALTA: "Posible falta", SIN_CATEGORIA: "Sin categoría" };
const pad = (n) => String(n).padStart(2, "0");
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function rangoQuincena(mes, quincena) {
  const ult = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  return Number(quincena) === 1 ? { desde: `${mes}-01`, hasta: `${mes}-15` } : { desde: `${mes}-16`, hasta: `${mes}-${pad(ult)}` };
}

async function cierreQuincena(pool, { mes, quincena, hoy, ahoraMs }) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ""))) return { error: "Indicá el mes (AAAA-MM) y la quincena (1 o 2).", status: 400 };
  if (![1, 2].includes(Number(quincena))) return { error: "La quincena es 1 (del 1 al 15) o 2 (del 16 al fin de mes).", status: 400 };
  const { desde, hasta } = rangoQuincena(mes, quincena);

  const liq = await liquidarDesdeBD(pool, { mes, quincena: Number(quincena), detalle: "compacto" });
  if (liq.error && !liq.operarios) return { periodo: { mes, quincena: Number(quincena), desde, hasta }, operarios: [], resumen: { operarios: 0, listos: 0, con_pendientes: 0, pendientes: 0 }, sin_fichadas: true };

  // La ventana de fichadas llega hasta el inicio de la quincena (Lía solo mira los últimos 7 días para "falta la salida").
  const desdeTxt = new Date(Math.min(ahoraMs - 46 * 86400000, new Date(`${desde}T00:00:00`).getTime() - 3 * 86400000));
  const ini = `${desdeTxt.getFullYear()}-${pad(desdeTxt.getMonth() + 1)}-${pad(desdeTxt.getDate())} 00:00:00`;
  const [fichadas] = await pool.query("SELECT nombre, tipo, fecha_hora FROM fichadas WHERE fecha_hora >= ? ORDER BY fecha_hora", [ini]);
  const [feriados] = await pool.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, descripcion FROM fichero_feriados");
  const [ajustes] = await pool.query("SELECT nombre_operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora_inicio_pactada, '%H:%i') AS hora_inicio_pactada FROM fichero_ajustes_dias");
  const [cats] = await pool.query("SELECT nombre_operario, categoria_codigo FROM fichero_operarios_categorias");
  const hallazgos = analizarRRHH({
    hoy, ahoraMs, fichadas,
    feriados: new Map(feriados.map((r) => [r.fecha, r.descripcion || ""])),
    ajustes,
    categorias: new Map(cats.filter((c) => c.categoria_codigo).map((c) => [c.nombre_operario, c.categoria_codigo])),
  });
  // Lo que ya se justificó o descartó en Lía no vuelve a aparecer como pendiente.
  let cerrados = new Set();
  try {
    const [c] = await pool.query("SELECT clave FROM agentes_hallazgos WHERE agente = 'rrhh' AND estado IN ('JUSTIFICADA','DESCARTADA')");
    cerrados = new Set(c.map((x) => x.clave));
  } catch { /* la tabla puede no existir todavía */ }

  const pendientesDe = new Map();
  const hechos = new Set();
  const agregar = (operario, p) => {
    if (!pendientesDe.has(operario)) pendientesDe.set(operario, []);
    pendientesDe.get(operario).push(p);
  };
  // Salidas sin fichar en toda la quincena (un turno que ingresó hace menos de un día todavía puede estar en curso).
  const porNombre = new Map();
  for (const f of fichadas) {
    if (!porNombre.has(f.nombre)) porNombre.set(f.nombre, []);
    porNombre.get(f.nombre).push(f);
  }
  for (const [nombre, marcas] of porNombre) {
    for (const t of emparejarTurnos(marcas)) {
      if (t.salidaTs != null || t.fecha < desde || t.fecha > hasta || ahoraMs - t.entradaTs <= 24 * 3600000) continue;
      if (cerrados.has(`sinsalida:${nombre}:${t.fecha}`)) continue;
      hechos.add(`sinsalida:${nombre}:${t.fecha}`);
      agregar(nombre, { tipo: "SIN_SALIDA", texto: TIPOS.SIN_SALIDA, fecha: t.fecha });
    }
  }
  for (const h of hallazgos) {
    if (hechos.has(h.clave)) continue;
    if (!TIPOS[h.tipo] || !h.operario || cerrados.has(h.clave)) continue;
    if (h.tipo !== "SIN_CATEGORIA" && !(h.fecha >= desde && h.fecha <= hasta)) continue;
    agregar(h.operario, { tipo: h.tipo, texto: TIPOS[h.tipo], fecha: h.fecha || null });
  }

  const operarios = (liq.operarios || []).map((o) => {
    const pendientes = (pendientesDe.get(o.operario) || []).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return {
      nombre: o.operario,
      categoria: o.categoria,
      horas_normales: r2(o.horas_normales),
      horas_extra: r2(o.horas_extra),
      dias: o.dias_con_turno ?? 0,
      llegadas_tarde: o.presentismo?.llegadas_tarde_en_el_periodo ?? 0,
      pendientes,
    };
  }).sort((a, b) => b.pendientes.length - a.pendientes.length || a.nombre.localeCompare(b.nombre));
  const conPend = operarios.filter((o) => o.pendientes.length);
  return {
    periodo: { mes, quincena: Number(quincena), desde, hasta },
    operarios,
    resumen: { operarios: operarios.length, listos: operarios.length - conPend.length, con_pendientes: conPend.length, pendientes: conPend.reduce((a, o) => a + o.pendientes.length, 0) },
  };
}

module.exports = { cierreQuincena, rangoQuincena };
