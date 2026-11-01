/** Valor: null (sin definir) | { sin: true } | { pct: número }. Sin una elección no se arma ningún borrador. */
export const descuentoDefinido = (v) => !!v && (v.sin === true || (Number.isFinite(v.pct) && v.pct >= 0 && v.pct <= 60));
export const descuentoTexto = (v) => (!descuentoDefinido(v) ? "" : v.sin ? "sin descuento" : `${v.pct}% de descuento`);
