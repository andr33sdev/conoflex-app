/** Un despacho puede juntar varias OP del mismo cliente: `op` viene como "42832, 42786, 42782". */
export const listaOps = (op) => String(op || "").split(",").map((x) => x.trim()).filter(Boolean);

const unArticulo = (a) => `${a.cantidad ? `${a.cantidad} × ` : ""}${a.modelo}`;

/** Artículos del despacho; si hay varias OP, agrupados con su número: [{ op, texto }]. */
export function articulosPorOp(d) {
  const ops = listaOps(d.op);
  const arts = d.articulos || [];
  if (ops.length < 2) return arts.length ? [{ op: null, texto: arts.map(unArticulo).join(" · ") }] : [];
  return ops.map((op) => ({ op, texto: arts.filter((a) => a.op === op).map(unArticulo).join(" · ") })).filter((g) => g.texto);
}
