"use strict";
// Reglas del módulo Desarrollo de productos (procedimiento P-11, registro R.032), sin base de datos.

// Etapas del R.032. "aprobable": la etapa se cierra con la aprobación de una persona.
const ETAPAS = [
  { id: "ENTRADAS", nombre: "Entradas del desarrollo", ayuda: "Qué se pide y para qué: necesidad, cliente o mercado, requisitos, materiales, de qué producto o muestra se parte.", aprobable: true },
  { id: "MATRICERO", nombre: "Matricero seleccionado", ayuda: "Quién hace la matriz, presupuesto, plazos. Si no hace falta matriz nueva, marcalo como «No aplica».", aprobable: true },
  { id: "VERIFICACION", nombre: "Verificación", ayuda: "Lo que sale del desarrollo, ¿cumple con las entradas? Cotas, pesos, espesores, ensamble. Cargá cada prueba con su método y resultado.", aprobable: true },
  { id: "VALIDACION", nombre: "Validación", ayuda: "¿Sirve para el uso previsto? Pruebas con muestras reales, impacto, intemperie, cliente.", aprobable: true },
  { id: "ESPECIFICACIONES", nombre: "Especificaciones finales", ayuda: "Especificación del producto con su receta (Ingeniería), plano o imagen oficial y datos para producir.", aprobable: true },
  { id: "CAMBIOS", nombre: "Cambios durante el proyecto", ayuda: "Todo lo que cambió respecto de lo planeado y por qué.", aprobable: false },
];
// En una modificación de un producto existente (cambio menor) el circuito es más corto.
const ETAPAS_MODIFICACION = [
  { id: "ENTRADAS", nombre: "Cambio propuesto", ayuda: "Qué se cambia, en qué producto y por qué. Lo aprueba la Dirección.", aprobable: true },
  { id: "ESPECIFICACIONES", nombre: "Documentación actualizada", ayuda: "Ficha de producción, receta en Ingeniería, proveedores avisados.", aprobable: true },
];
const etapasDe = (tipo) => (tipo === "MODIFICACION" ? ETAPAS_MODIFICACION : ETAPAS);
const ESTADOS_ETAPA = ["PENDIENTE", "EN_CURSO", "LISTA", "NO_APLICA"];
const ESTADOS_PROYECTO = ["EN_CURSO", "PAUSADO", "TERMINADO", "DESCARTADO"];
const TIPOS = ["NUEVO", "MODIFICACION"];
const ORIGENES = ["DIRECCION", "CLIENTE", "MERCADO", "INTERNO"];
const TIPOS_ARCHIVO = ["FOTO", "RENDER", "PLANO", "DOCUMENTO", "OTRO"];
const CUMPLE = ["PENDIENTE", "SI", "NO"];

/** Una etapa está cerrada si está lista y (si se aprueba) aprobada, o si no aplica. */
function etapaCerrada(etapa, def) {
  if (!etapa) return false;
  if (etapa.estado === "NO_APLICA") return true;
  if (etapa.estado !== "LISTA") return false;
  return !def?.aprobable || etapa.aprobacion_estado === "APROBADA";
}

/** Avance del proyecto: etapas cerradas sobre las que cuentan (las de "cambios" no cuentan). */
function progreso(tipo, etapas) {
  const defs = etapasDe(tipo).filter((d) => d.id !== "CAMBIOS");
  const porId = new Map((etapas || []).map((e) => [e.etapa, e]));
  const cerradas = defs.filter((d) => etapaCerrada(porId.get(d.id), d)).length;
  const actual = defs.find((d) => !etapaCerrada(porId.get(d.id), d));
  return { cerradas, total: defs.length, pct: defs.length ? Math.round((cerradas / defs.length) * 100) : 0, etapa_actual: actual?.id || null, etapa_actual_nombre: actual?.nombre || null };
}

const conTexto = (t) => String(t || "").replace(/[\s\-–•·]/g, "").length > 0;

/**
 * Revisión contra el P-11 (ISO 9001 8.3): qué está y qué falta para que el proyecto quede bien documentado.
 * p: { tipo, etapas, archivos, pruebas, items (con tiene_receta), avisos }
 */
function revisionIso(p) {
  const et = new Map((p.etapas || []).map((e) => [e.etapa, e]));
  const aprobada = (id) => et.get(id)?.aprobacion_estado === "APROBADA" || et.get(id)?.estado === "NO_APLICA";
  const archivos = p.archivos || [];
  const pruebas = p.pruebas || [];
  const items = p.items || [];
  const avisos = p.avisos || [];
  const it = [];
  const add = (id, texto, ok, como) => it.push({ id, texto, ok: !!ok, como: ok ? null : como });

  if (p.tipo === "MODIFICACION") {
    add("cambio", "El cambio está descripto", conTexto(et.get("ENTRADAS")?.detalle), "Escribí qué se cambia y por qué en «Cambio propuesto».");
    add("aprobado", "La Dirección aprobó el cambio", aprobada("ENTRADAS"), "Pedí la aprobación de «Cambio propuesto».");
    add("difusion", "Se avisó a los líderes de área", avisos.length > 0, "En «Difusión», elegí a quiénes avisar.");
    add("enterados", "Todos los avisados confirmaron", avisos.length > 0 && avisos.every((a) => a.enterado_at), "Faltan confirmaciones de «enterado».");
    add("documentacion", "Documentación actualizada y aprobada", aprobada("ESPECIFICACIONES"), "Actualizá ficha y receta y pedí la aprobación de «Documentación actualizada».");
  } else {
    add("entradas", "Entradas del desarrollo registradas", conTexto(et.get("ENTRADAS")?.detalle), "Escribí qué se pide, para quién y de qué se parte.");
    add("entradas_ok", "Entradas aprobadas", aprobada("ENTRADAS"), "Pedí la aprobación de «Entradas del desarrollo».");
    add("fotos", "Fotos, renders o planos en el proyecto", archivos.length > 0, "Subí fotos, renders o planos en «Archivos».");
    add("verificacion", "Verificación con método y resultado", pruebas.some((x) => x.tipo === "VERIFICACION" && conTexto(x.metodo) && conTexto(x.resultado)) || et.get("VERIFICACION")?.estado === "NO_APLICA", "Cargá al menos una prueba de verificación con método y resultado.");
    add("verificacion_ok", "Verificación aprobada", aprobada("VERIFICACION"), "Pedí la aprobación de «Verificación».");
    add("validacion_ok", "Validación aprobada (apto para el uso previsto)", aprobada("VALIDACION"), "Registrá la validación y pedí su aprobación.");
    add("pruebas", "Ninguna prueba pendiente ni fallida sin resolver", pruebas.every((x) => x.cumple === "SI" || (x.cumple === "NO" && conTexto(x.accion))), "Hay pruebas pendientes o que no cumplen sin acción indicada.");
    add("receta", "Especificación con receta en Ingeniería", items.some((x) => x.tipo === "PT" && x.tiene_receta), "Creá o vinculá el producto terminado y cargale la receta en Ingeniería.");
    add("oficial", "Imagen 2D/3D oficial aprobada", archivos.some((a) => a.es_oficial), "Marcá como «oficial» el plano o render aprobado antes de la primera producción.");
    add("especificaciones_ok", "Especificaciones finales aprobadas", aprobada("ESPECIFICACIONES"), "Pedí la aprobación de «Especificaciones finales».");
  }
  const ok = it.filter((x) => x.ok).length;
  return { items: it, ok, total: it.length, pct: it.length ? Math.round((ok / it.length) * 100) : 0, completo: ok === it.length };
}

/** Próximo código de proyecto: DP-2026-001, DP-2026-002… según el último del año. */
function siguienteCodigo(ultimo, anio) {
  const m = String(ultimo || "").match(/^DP-(\d{4})-(\d+)$/);
  const n = m && Number(m[1]) === anio ? Number(m[2]) + 1 : 1;
  return `DP-${anio}-${String(n).padStart(3, "0")}`;
}

/** Agrega renglones a un detalle con viñetas, sin repetir los que ya están. */
function sumarPuntos(detalle, puntos) {
  const actual = String(detalle || "").split("\n").map((l) => l.trim()).filter((l) => l && l !== "-");
  const ya = new Set(actual.map((l) => l.replace(/^[-•]\s*/, "").toLowerCase()));
  for (const p of puntos || []) {
    const t = String(p || "").replace(/^[-•]\s*/, "").trim();
    if (t && !ya.has(t.toLowerCase())) {
      actual.push(`- ${t}`);
      ya.add(t.toLowerCase());
    }
  }
  return actual.join("\n");
}

/** Limpia lo que propone la IA: solo etapas, pruebas y valores válidos. */
function limpiarSugerencia(s, tipo) {
  const ids = new Set(etapasDe(tipo).map((e) => e.id));
  const etapas = [];
  for (const e of Array.isArray(s?.etapas) ? s.etapas : []) {
    const id = String(e?.etapa || "").toUpperCase();
    const puntos = (Array.isArray(e?.puntos) ? e.puntos : []).map((x) => String(x || "").trim().slice(0, 400)).filter(Boolean).slice(0, 12);
    if (ids.has(id) && puntos.length) etapas.push({ etapa: id, puntos });
  }
  const pruebas = (Array.isArray(s?.pruebas) ? s.pruebas : [])
    .map((x) => ({
      tipo: String(x?.tipo || "").toUpperCase() === "VALIDACION" ? "VALIDACION" : "VERIFICACION",
      que: String(x?.que || "").trim().slice(0, 200),
      metodo: String(x?.metodo || "").trim().slice(0, 400),
      objetivo: String(x?.objetivo || "").trim().slice(0, 200),
      resultado: String(x?.resultado || "").trim().slice(0, 400),
      cumple: CUMPLE.includes(String(x?.cumple || "").toUpperCase()) ? String(x.cumple).toUpperCase() : "PENDIENTE",
    }))
    .filter((x) => x.que)
    .slice(0, 10);
  return { resumen: String(s?.resumen || "").trim().slice(0, 300), etapas, pruebas };
}

module.exports = { ETAPAS, ETAPAS_MODIFICACION, etapasDe, ESTADOS_ETAPA, ESTADOS_PROYECTO, TIPOS, ORIGENES, TIPOS_ARCHIVO, CUMPLE, etapaCerrada, progreso, revisionIso, siguienteCodigo, sumarPuntos, limpiarSugerencia };
