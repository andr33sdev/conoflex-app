"use strict";
// Fórmula por "tachada": cuántos kg de cada materia prima entran en una tachada (una mezcla).
// De ahí salen los porcentajes y, con el peso de la pieza, los kg de cada material por pieza.
//   Ej.: 20 kg grumo + 4 kg polietileno + 0,2 kg masterbatch = 24,2 kg → 82,6 % / 16,5 % / 0,8 %.
//   Pieza de 1,48 kg → 1,2231 kg de grumo, 0,2446 kg de polietileno, 0,0122 kg de masterbatch.

const redondear = (n, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

/** Número positivo o NaN. Acepta coma decimal. */
function numero(v) {
  if (v === "" || v == null) return NaN;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/** Líneas válidas: [{ mp_id, codigo?, nombre?, kg_tachada }] con kg > 0 y sin materiales repetidos. */
function validarLineas(lineas) {
  if (!Array.isArray(lineas) || !lineas.length) return { error: "La fórmula necesita al menos un material." };
  const vistos = new Set();
  const limpias = [];
  for (const l of lineas) {
    const mp = Number(l.mp_id ?? l.materia_prima_id);
    if (!Number.isInteger(mp) || mp <= 0) return { error: "Hay una línea sin material." };
    if (vistos.has(mp)) return { error: `El material ${l.codigo || l.nombre || mp} está repetido en la fórmula.` };
    vistos.add(mp);
    const kg = numero(l.kg_tachada ?? l.cantidad_tachada);
    if (!(kg > 0)) return { error: `Poné cuántos kg de ${l.nombre || l.codigo || "cada material"} lleva la tachada.` };
    limpias.push({ mp_id: mp, codigo: l.codigo || "", nombre: l.nombre || "", kg_tachada: kg });
  }
  return { lineas: limpias };
}

function totalTachada(lineas) {
  return redondear((lineas || []).reduce((a, l) => a + (Number(l.kg_tachada) || 0), 0));
}

/** Porcentaje de cada material sobre el total de la tachada. */
function conPorcentajes(lineas) {
  const total = totalTachada(lineas);
  return (lineas || []).map((l) => ({ ...l, pct: total > 0 ? redondear((Number(l.kg_tachada) / total) * 100, 4) : 0 }));
}

/** kg de cada material por pieza = peso de la pieza × porcentaje. Devuelve [{...linea, pct, kg_pieza}]. */
function cantidadesPorPieza(lineas, pesoPieza) {
  const peso = Number(pesoPieza) || 0;
  return conPorcentajes(lineas).map((l) => ({ ...l, kg_pieza: redondear((peso * l.pct) / 100, 6) }));
}

/**
 * Compara la fórmula definida en Ingenierías con la que realmente se usó.
 * Distinta si cambia el conjunto de materiales, algún porcentaje se mueve más de `tolPct` puntos,
 * o el peso de la pieza difiere más de `tolPeso` (proporción, 0,02 = 2 %).
 */
function compararFormulas(definida, usada, { tolPct = 0.1, tolPeso = 0.02 } = {}) {
  const A = new Map(conPorcentajes(definida.lineas || []).map((l) => [l.mp_id, l]));
  const B = new Map(conPorcentajes(usada.lineas || []).map((l) => [l.mp_id, l]));
  const diferencias = [];
  for (const [id, a] of A) {
    const b = B.get(id);
    if (!b) diferencias.push({ tipo: "falta", mp_id: id, codigo: a.codigo, nombre: a.nombre, pct_definida: a.pct, pct_usada: 0 });
    else if (Math.abs(a.pct - b.pct) > tolPct) diferencias.push({ tipo: "cambio", mp_id: id, codigo: a.codigo, nombre: a.nombre, pct_definida: a.pct, pct_usada: b.pct });
  }
  for (const [id, b] of B) {
    if (!A.has(id)) diferencias.push({ tipo: "nuevo", mp_id: id, codigo: b.codigo, nombre: b.nombre, pct_definida: 0, pct_usada: b.pct });
  }
  let peso = null;
  const pd = Number(definida.peso) || 0;
  const pu = Number(usada.peso) || 0;
  if (pd > 0 && pu > 0 && Math.abs(pu - pd) / pd > tolPeso) peso = { definido: pd, usado: pu };
  return { distinta: diferencias.length > 0 || !!peso, diferencias, peso };
}

/** Firma estable de una fórmula (para no repetir alertas idénticas). */
function firma(f) {
  return JSON.stringify({
    p: redondear(Number(f.peso) || 0, 3),
    l: conPorcentajes(f.lineas || [])
      .map((l) => [l.mp_id, redondear(l.pct, 1)])
      .sort((x, y) => x[0] - y[0]),
  });
}

module.exports = { redondear, numero, validarLineas, totalTachada, conPorcentajes, cantidadesPorPieza, compararFormulas, firma };
