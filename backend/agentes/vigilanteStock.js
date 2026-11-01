"use strict";
// Vigilante de Nati (stock y depósito): mira materias primas, semielaborados, compras en curso y solicitudes internas
// y detecta lo que hay que atender ANTES de que falte. El análisis es puro (se testea sin base de datos);
// `cargarStock` es quien lee la base con las mismas funciones de demanda que usa Connie.
const { demandaMateriasPrimas, demandaSemielaborados } = require("../demanda");

const DIA = 86400000;
const iso = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const num = (n, d = 1) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
const fmt = (n, d = 1) => Number(num(n, d)).toLocaleString("es-AR", { maximumFractionDigits: d });
const fechaCorta = (isoStr) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(isoStr || "");
  return m ? `${m[2]}/${m[1]}` : "";
};

/** Solo se alerta y se prioriza lo que se fabrica acá y al que se le sigue la demanda. */
const seFabricaYSeSigue = (s) => String(s.origen || "FABRICA").toUpperCase() === "FABRICA" && (s.seguir_demanda == null || Number(s.seguir_demanda) !== 0);

// Umbrales (días de cobertura). Se pueden ajustar sin tocar el resto.
const UMBRALES = { critico: 7, bajo: 15, exceso: 240, semiCritico: 5, semiBajo: 12 };

/** Nivel de una materia prima o semielaborado según los días que le alcanza. */
function nivelDe({ stock, dias, demanda }, { critico = UMBRALES.critico, bajo = UMBRALES.bajo } = {}) {
  if (stock < 0) return "negativo";
  if (!(demanda > 0)) return "sin_demanda";
  if (dias <= critico) return "critico";
  if (dias <= bajo) return "bajo";
  if (dias >= UMBRALES.exceso) return "exceso";
  return "ok";
}

/**
 * Hallazgos de stock.
 *  mps:      [{ id, codigo, nombre, unidad, stock_actual, demanda_mensual, dias_de_stock }]
 *  semis:    [{ codigo, nombre, stock_total, demanda_mensual, dias_de_stock }]
 *  internas: [{ id, semielaborado_nombre, cantidad_solicitada, urgencia, estado, solicitado_at }]  (solicitudes internas abiertas)
 *  compras:  [{ id, materia_prima_id, articulo, proveedor, cantidad_solicitada, cantidad_recibida, creada }]  (renglones sin recibir completo)
 */
function analizarStock({ mps = [], semis = [], internas = [], compras = [], ahoraMs = Date.now() } = {}) {
  const out = [];
  const compraDe = (mp) =>
    compras.filter((c) => (c.materia_prima_id && c.materia_prima_id === mp.id) || String(c.articulo || "").trim().toLowerCase() === String(mp.nombre || "").trim().toLowerCase());
  const pendiente = (cs) => cs.reduce((a, c) => a + Math.max(0, Number(c.cantidad_solicitada || 0) - Number(c.cantidad_recibida || 0)), 0);

  for (const mp of mps) {
    const stock = Number(mp.stock_actual) || 0;
    const demanda = Number(mp.demanda_mensual) || 0;
    const dias = mp.dias_de_stock;
    const u = mp.unidad || "";
    const cs = compraDe(mp);
    const falta = pendiente(cs);
    const compraTxt = cs.length
      ? `Hay una compra en curso${cs[0].proveedor ? ` con ${cs[0].proveedor}` : ""} por ${fmt(falta, 0)} ${u} sin recibir.`
      : "No hay ninguna compra en curso para este material.";
    if (stock < 0) {
      out.push({ clave: `stock-neg:${mp.id}`, tipo: "STOCK_NEGATIVO", severidad: "ALTA", titulo: `${mp.nombre} figura con stock negativo`, texto: `El sistema marca ${fmt(stock, 2)} ${u}. Eso pasa cuando se descuenta producción sin haber cargado el ingreso: conviene corregir la carga.`, operario: mp.nombre, fecha: null });
      continue;
    }
    if (!(demanda > 0) || dias == null) continue;
    const agota = iso(ahoraMs + dias * DIA);
    if (dias <= UMBRALES.critico) {
      out.push({ clave: `mp-crit:${mp.id}`, tipo: "MP_CRITICA", severidad: "ALTA", titulo: `${mp.nombre}: alcanza para ${dias <= 0 ? "menos de un día" : dias === 1 ? "1 día" : `${dias} días`}`, texto: `Quedan ${fmt(stock, 1)} ${u} y se consumen unos ${fmt(demanda, 0)} ${u} por mes: se agotaría hacia el ${fechaCorta(agota)}. ${compraTxt}`, operario: mp.nombre, fecha: agota });
    } else if (dias <= UMBRALES.bajo) {
      out.push({ clave: `mp-baja:${mp.id}`, tipo: "MP_BAJA", severidad: "MEDIA", titulo: `${mp.nombre}: alcanza para ${dias} días`, texto: `Quedan ${fmt(stock, 1)} ${u} (demanda ${fmt(demanda, 0)} ${u}/mes). ${compraTxt}`, operario: mp.nombre, fecha: agota });
    } else if (dias >= UMBRALES.exceso) {
      out.push({ clave: `mp-exceso:${mp.id}`, tipo: "MP_EXCESO", severidad: "BAJA", titulo: `${mp.nombre}: stock para ${Math.round(dias / 30)} meses`, texto: `Hay ${fmt(stock, 0)} ${u} y se usan unos ${fmt(demanda, 0)} ${u} por mes. Es plata inmovilizada: no hace falta comprar más por ahora.`, operario: mp.nombre, fecha: null });
    }
  }

  for (const s of semis) {
    if (!seFabricaYSeSigue(s)) continue; // lo comprado, lo de Paraguay y lo que no se sigue no genera alertas de producción
    const demanda = Number(s.demanda_mensual) || 0;
    if (!(demanda > 0) || s.dias_de_stock == null) continue;
    const dias = s.dias_de_stock;
    if (dias <= UMBRALES.semiCritico) {
      out.push({ clave: `semi-crit:${s.codigo}`, tipo: "SEMI_CRITICO", severidad: "ALTA", titulo: `${s.nombre}: stock para ${dias <= 0 ? "menos de un día" : `${dias} ${dias === 1 ? "día" : "días"}`}`, texto: `Hay ${fmt(s.stock_total, 0)} unidades entre todos los depósitos y se necesitan unas ${fmt(demanda, 0)} por mes. Conviene programar su producción.`, operario: s.nombre, fecha: iso(ahoraMs + dias * DIA) });
    } else if (dias <= UMBRALES.semiBajo) {
      out.push({ clave: `semi-baja:${s.codigo}`, tipo: "SEMI_BAJO", severidad: "MEDIA", titulo: `${s.nombre}: stock para ${dias} días`, texto: `Hay ${fmt(s.stock_total, 0)} unidades (demanda ${fmt(demanda, 0)} por mes).`, operario: s.nombre, fecha: iso(ahoraMs + dias * DIA) });
    }
  }

  for (const r of internas) {
    if (String(r.estado || "").toUpperCase() !== "SOLICITADO") continue;
    const t = new Date(String(r.solicitado_at).replace(" ", "T")).getTime();
    if (!Number.isFinite(t)) continue;
    const horas = (ahoraMs - t) / 3600000;
    const alta = String(r.urgencia || "").toUpperCase() === "ALTA";
    if (horas >= (alta ? 2 : 6)) {
      out.push({ clave: `interna:${r.id}`, tipo: "INTERNA_DEMORADA", severidad: alta ? "ALTA" : "MEDIA", titulo: `Pedido ${r.id} sin atender hace ${horas >= 24 ? `${Math.floor(horas / 24)} d` : `${Math.floor(horas)} h`}: ${r.semielaborado_nombre}`, texto: `Producción pidió ${fmt(r.cantidad_solicitada, 0)} unidades (urgencia ${String(r.urgencia || "").toLowerCase()}) y todavía nadie lo atendió.`, operario: r.semielaborado_nombre, fecha: iso(t) });
    }
  }

  for (const c of compras) {
    const t = new Date(String(c.creada).replace(" ", "T")).getTime();
    const falta = Number(c.cantidad_solicitada || 0) - Number(c.cantidad_recibida || 0);
    if (!Number.isFinite(t) || falta <= 0) continue;
    const dias = (ahoraMs - t) / DIA;
    if (dias >= 14) {
      out.push({ clave: `compra-demora:${c.id}`, tipo: "COMPRA_DEMORADA", severidad: "MEDIA", titulo: `${c.articulo}: compra sin recibir hace ${Math.floor(dias)} días`, texto: `Falta recibir ${fmt(falta, 0)} de ${fmt(c.cantidad_solicitada, 0)}${c.proveedor ? ` a ${c.proveedor}` : ""}. Conviene reclamarla.`, operario: c.articulo, fecha: iso(t) });
    }
  }
  return out;
}

/** Datos listos para dibujar el panorama (y el depósito 3D): lo más importante primero. */
function armarPanorama({ mps = [], semis = [], series = new Map(), internas = [], compras = [], ahoraMs = Date.now() }) {
  const pendiente = (mp) =>
    compras
      .filter((c) => (c.materia_prima_id && c.materia_prima_id === mp.id) || String(c.articulo || "").trim().toLowerCase() === String(mp.nombre || "").trim().toLowerCase())
      .reduce((a, c) => a + Math.max(0, Number(c.cantidad_solicitada || 0) - Number(c.cantidad_recibida || 0)), 0);
  const orden = { negativo: 0, critico: 1, bajo: 2, ok: 3, exceso: 4, sin_demanda: 5 };
  const materias = mps
    .map((m) => {
      const stock = Number(m.stock_actual) || 0;
      const demanda = Number(m.demanda_mensual) || 0;
      const nivel = nivelDe({ stock, dias: m.dias_de_stock, demanda });
      const falta = pendiente(m);
      return {
        id: m.id, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad || "", stock: num(stock, 1), demanda_mensual: num(demanda, 1),
        dias: m.dias_de_stock ?? null, agota: m.dias_de_stock != null && demanda > 0 ? iso(ahoraMs + m.dias_de_stock * DIA) : null,
        nivel, compra_pendiente: num(falta, 0), serie: series.get(m.id) || [],
      };
    })
    .sort((a, b) => orden[a.nivel] - orden[b.nivel] || (a.dias ?? 1e9) - (b.dias ?? 1e9));
  const semielaborados = semis
    .map((s) => ({
      codigo: s.codigo, nombre: s.nombre, stock_total: num(s.stock_total, 0), por_deposito: s.por_deposito || null, demanda_mensual: num(s.demanda_mensual, 1), dias: s.dias_de_stock ?? null,
      origen: String(s.origen || "FABRICA").toUpperCase(), seguir_demanda: s.seguir_demanda == null ? 1 : Number(s.seguir_demanda),
      nivel: s.seguir_demanda != null && Number(s.seguir_demanda) === 0 ? "sin_demanda" : nivelDe({ stock: s.stock_total, dias: s.dias_de_stock, demanda: s.demanda_mensual }, { critico: UMBRALES.semiCritico, bajo: UMBRALES.semiBajo }),
    }))
    .sort((a, b) => orden[a.nivel] - orden[b.nivel] || (a.dias ?? 1e9) - (b.dias ?? 1e9));
  const cuenta = (lista, n) => lista.filter((x) => x.nivel === n).length;
  const cuentaFabrica = (n) => semielaborados.filter((x) => x.nivel === n && x.origen === "FABRICA").length;
  return {
    generado: new Date(ahoraMs).toISOString(),
    materias,
    semielaborados,
    resumen: {
      materias: materias.length, criticas: cuenta(materias, "critico") + cuenta(materias, "negativo"), bajas: cuenta(materias, "bajo"),
      semis_criticos: cuentaFabrica("critico"), semis_bajos: cuentaFabrica("bajo"),
      internas_pendientes: internas.filter((r) => String(r.estado).toUpperCase() === "SOLICITADO").length,
      compras_abiertas: compras.length,
    },
  };
}

/** Lee todo lo necesario de la base. */
async function cargarStock(pool, { ahoraMs = Date.now() } = {}) {
  const dm = await demandaMateriasPrimas(pool, { meses: 3, solo_con_demanda: false });
  const mps = dm.materias_primas || [];
  const ds = await demandaSemielaborados(pool, { meses: 3, solo_con_demanda: false });
  let filas;
  try {
    [filas] = await pool.query("SELECT codigo, origen, seguir_demanda, stock_33, stock_26, stock_ayolas, stock_37 FROM semielaborados");
  } catch {
    [filas] = await pool.query("SELECT codigo, stock_33, stock_26, stock_ayolas, stock_37 FROM semielaborados"); // todavía sin la clasificación
  }
  const porDep = new Map(filas.map((f) => [f.codigo, { "33": Number(f.stock_33) || 0, "26": Number(f.stock_26) || 0, ayolas: Number(f.stock_ayolas) || 0, "37": Number(f.stock_37) || 0 }]));
  const clasif = new Map(filas.map((f) => [f.codigo, { origen: String(f.origen || "FABRICA").toUpperCase(), seguir_demanda: f.seguir_demanda == null ? 1 : Number(f.seguir_demanda) }]));
  const semis = (ds.semielaborados || []).map((s) => ({ ...s, ...(clasif.get(s.codigo) || { origen: "FABRICA", seguir_demanda: 1 }), por_deposito: porDep.get(s.codigo) || null }));
  const [internas] = await pool.query("SELECT id, semielaborado_nombre, cantidad_solicitada, urgencia, estado, solicitado_at FROM solicitudes_internas WHERE estado IN ('SOLICITADO','ATENDIDO','DISPONIBLE')");
  // Las listas que Vera todavía está armando no son compras: recién cuentan cuando las cierra.
  const SQL_COMPRAS = (excluirBorradores) => `SELECT i.id, i.materia_prima_id, i.articulo, i.proveedor, i.cantidad_solicitada, i.cantidad_recibida, s.created_at AS creada
       FROM solicitudes_compra_items i JOIN solicitudes_compra s ON s.id = i.solicitud_id
      WHERE UPPER(COALESCE(s.estado,'')) NOT IN ('COMPLETADA','CANCELADA','ANULADA') AND COALESCE(i.cantidad_recibida,0) < COALESCE(i.cantidad_solicitada,0)
      ${excluirBorradores ? "AND s.id NOT IN (SELECT solicitud_id FROM agentes_compras_listas WHERE cerrada = 0)" : ""}`;
  let compras;
  try {
    [compras] = await pool.query(SQL_COMPRAS(true));
  } catch {
    [compras] = await pool.query(SQL_COMPRAS(false)); // todavía no existe la tabla de listas
  }
  // Consumo diario (30 días) para dibujar la tendencia de cada materia prima.
  const series = new Map();
  try {
    const [mov] = await pool.query(
      "SELECT materia_prima_id AS id, DATEDIFF(CURDATE(), DATE(fecha)) AS atras, SUM(-cantidad) AS total FROM mp_movimientos WHERE tipo IN ('CONSUMO_PRODUCCION','REVERSA_PRODUCCION') AND fecha >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY materia_prima_id, DATEDIFF(CURDATE(), DATE(fecha))",
    );
    for (const r of mov) {
      const arr = series.get(r.id) || Array(30).fill(0);
      if (r.atras >= 0 && r.atras < 30) arr[29 - r.atras] = Math.max(0, num(r.total, 1));
      series.set(r.id, arr);
    }
  } catch { /* sin movimientos todavía */ }
  return { mps, semis, internas, compras, series, ahoraMs };
}

module.exports = { seFabricaYSeSigue, analizarStock, armarPanorama, cargarStock, nivelDe, UMBRALES };
