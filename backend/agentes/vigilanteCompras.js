"use strict";
// Vigilante de Vera (compras): sin IA, solo consultas. Detecta solicitudes sin firmar, renglones demorados por proveedor,
// proveedores que incumplen y listas de compra que quedaron a medio armar. Todo se resuelve solo cuando deja de pasar.
const DIA = 86400000;
const hace = (ms) => Math.floor(ms / DIA);
const fechaCorta = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}` : "";
};
const AUTORESOLVIBLES = new Set(["SOLICITUD_SIN_FIRMA", "PROVEEDOR_INCUMPLE", "RENGLONES_DEMORADOS", "LISTA_ABIERTA"]);

/**
 * solicitudes: [{id, fecha, estado, firma_jefe, firma_gerente, created_at}]
 * renglones: [{solicitud_id, articulo, proveedor, cantidad_solicitada, cantidad_recibida, creada}]
 * listas: [{usuario, solicitud_id, renglones, desde}]  (listas en armado sin cerrar)
 */
function analizarCompras({ solicitudes = [], renglones = [], listas = [], ahoraMs = Date.now() } = {}) {
  const out = [];
  const enListas = new Set(listas.map((l) => l.solicitud_id));
  for (const s of solicitudes) {
    if (String(s.estado || "").toUpperCase() !== "ABIERTA" || enListas.has(s.id)) continue;
    const dias = hace(ahoraMs - new Date(String(s.created_at).replace(" ", "T")).getTime());
    const falta = [!s.firma_jefe && "jefe", !s.firma_gerente && "gerente"].filter(Boolean);
    if (falta.length && dias >= 2) {
      out.push({ clave: `sin-firma:${s.id}`, tipo: "SOLICITUD_SIN_FIRMA", severidad: dias >= 5 ? "ALTA" : "MEDIA", titulo: `La solicitud #${s.id} espera la firma ${falta.length === 2 ? "del jefe y del gerente" : "del " + falta[0]} hace ${dias} días`, texto: `Se creó el ${fechaCorta(s.fecha)}. Hasta que se firme no se puede pedir al proveedor.`, operario: `Solicitud #${s.id}`, fecha: String(s.fecha || "").slice(0, 10) || null });
    }
  }
  // Renglones pedidos hace tiempo sin recibir, agrupados por proveedor.
  const porProv = new Map();
  for (const r of renglones) {
    const pendiente = Number(r.cantidad_solicitada || 0) - Number(r.cantidad_recibida || 0);
    if (pendiente <= 0) continue;
    const dias = hace(ahoraMs - new Date(String(r.creada).replace(" ", "T")).getTime());
    if (dias < 7) continue;
    const p = String(r.proveedor || "Sin proveedor");
    const e = porProv.get(p) || { n: 0, max: 0, arts: [] };
    e.n++;
    e.max = Math.max(e.max, dias);
    if (e.arts.length < 3) e.arts.push(r.articulo);
    porProv.set(p, e);
  }
  for (const [p, e] of porProv) {
    out.push({ clave: `demorados:${p}`, tipo: "RENGLONES_DEMORADOS", severidad: e.max >= 20 ? "ALTA" : "MEDIA", titulo: `${p}: ${e.n} ${e.n === 1 ? "renglón" : "renglones"} sin recibir hace hasta ${e.max} días`, texto: `Entre ellos: ${e.arts.join(", ")}${e.n > 3 ? " y más" : ""}. Conviene reclamar al proveedor.`, operario: p, fecha: null });
  }
  // Cumplimiento por proveedor (solo con historia suficiente).
  const viejos = renglones.filter((r) => hace(ahoraMs - new Date(String(r.creada).replace(" ", "T")).getTime()) >= 15);
  const cumplimiento = rankingProveedores(viejos);
  for (const c of cumplimiento) {
    if (c.renglones >= 4 && c.cumplido_pct < 50) {
      out.push({ clave: `incumple:${c.proveedor}`, tipo: "PROVEEDOR_INCUMPLE", severidad: "MEDIA", titulo: `${c.proveedor} entregó solo el ${c.cumplido_pct}% de lo pedido`, texto: `De ${c.renglones} renglones, recibió ${c.cumplido_pct}% de las cantidades. Mirá si conviene otro proveedor.`, operario: c.proveedor, fecha: null });
    }
  }
  for (const l of listas) {
    const dias = hace(ahoraMs - new Date(String(l.desde).replace(" ", "T")).getTime());
    if (dias >= 1 && l.renglones > 0) {
      out.push({ clave: `lista:${l.solicitud_id}`, tipo: "LISTA_ABIERTA", severidad: "BAJA", titulo: `La lista de compra de ${l.usuario} sigue en armado (${l.renglones} ${l.renglones === 1 ? "renglón" : "renglones"})`, texto: `Está abierta hace ${dias} ${dias === 1 ? "día" : "días"}. Cuando esté completa, pedile a Vera que la cierre para firmar.`, operario: l.usuario, fecha: null });
    }
  }
  return out;
}

/** Cumplimiento por proveedor: qué porcentaje de las cantidades pedidas llegó. */
function rankingProveedores(renglones = []) {
  const m = new Map();
  for (const r of renglones) {
    const p = String(r.proveedor || "Sin proveedor");
    const e = m.get(p) || { proveedor: p, renglones: 0, pedido: 0, recibido: 0 };
    e.renglones++;
    e.pedido += Number(r.cantidad_solicitada || 0);
    e.recibido += Math.min(Number(r.cantidad_recibida || 0), Number(r.cantidad_solicitada || 0));
    m.set(p, e);
  }
  return [...m.values()]
    .map((e) => ({ proveedor: e.proveedor, renglones: e.renglones, cumplido_pct: e.pedido > 0 ? Math.round((e.recibido / e.pedido) * 100) : 0 }))
    .sort((a, b) => b.renglones - a.renglones);
}

module.exports = { analizarCompras, rankingProveedores, AUTORESOLVIBLES };
