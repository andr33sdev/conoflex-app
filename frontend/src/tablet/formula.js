export const aNum = (t) => Number(String(t).replace(",", "."));

/** Pasa las líneas de la receta (kg por tachada) al estado editable del formulario. */
export const lineasIniciales = (lineas) => (lineas || []).map((l) => ({ mp_id: l.mp_id, codigo: l.codigo, nombre: l.nombre, kg: String(l.kg_tachada) }));

/** Líneas listas para enviar; devuelve { error } si alguna no es válida. */
export function lineasParaEnviar(lineas) {
  const out = [];
  for (const l of lineas) {
    const kg = aNum(l.kg);
    if (!(kg > 0)) return { error: `Poné cuántos kg de ${l.nombre || l.codigo} lleva la tachada.` };
    out.push({ mp_id: l.mp_id, kg_tachada: kg });
  }
  return out.length ? { lineas: out } : { error: "La fórmula necesita al menos un material." };
}

