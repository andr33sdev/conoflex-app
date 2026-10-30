// Mismas reglas que valida el servidor al lanzar (el servidor es quien decide de verdad).
export function problemasDeTurno(asigs) {
  const p = [];
  for (const a of asigs) {
    const q = `${a.lote} · ${a.semielaborado_nombre}`;
    if (!a.maquina_id) p.push(`${q}: falta la máquina.`);
    if (!(Number(a.cantidad) > 0)) p.push(`${q}: falta la cantidad.`);
    if (!String(a.operario || "").trim()) p.push(`${q}: falta el operario.`);
    if (!a.receta_confirmada) p.push(`${q}: falta confirmar la receta.`);
  }
  return p;
}

export function estadoTurno(info, asigs) {
  if (info?.lanzado) return { tono: "verde", texto: "Lanzado" };
  if (info?.sin_produccion) return { tono: "gris", texto: "Sin producción" };
  if (!asigs.length) return { tono: "gris", texto: "Libre" };
  return problemasDeTurno(asigs).length ? { tono: "amarillo", texto: "Faltan datos" } : { tono: "naranja", texto: "Listo para lanzar" };
}
