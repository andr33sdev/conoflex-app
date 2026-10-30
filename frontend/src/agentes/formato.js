// "2026-10-29 14:32:05" (hora del servidor, sin zona) → "hoy 14:32" / "ayer 09:10" / "28/10 14:32"
const p2 = (n) => String(n).padStart(2, "0");
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const ayerLocal = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export function cuando(dt) {
  // El servidor puede mandar "2026-10-29T22:41:29.000Z" (UTC): se pasa a la hora del navegador.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(String(dt || ""))) {
    const d = new Date(dt);
    if (!Number.isNaN(d.getTime())) dt = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(dt || ""));
  if (!m) return "—";
  const dia = `${m[1]}-${m[2]}-${m[3]}`;
  const hora = `${m[4]}:${m[5]}`;
  if (dia === hoyLocal()) return `hoy ${hora}`;
  if (dia === ayerLocal()) return `ayer ${hora}`;
  return `${m[3]}/${m[2]} ${hora}`;
}
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DIAS[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}
export const TIPOS_AVISO = {
  PRESENTISMO_PERDIDO: { texto: "Perdió presentismo", tono: "rojo" },
  PRESENTISMO_RIESGO: { texto: "Presentismo en riesgo", tono: "amarillo" },
  SIN_SALIDA: { texto: "Falta salida", tono: "rojo" },
  SIN_INGRESO: { texto: "Falta ingreso", tono: "rojo" },
  POSIBLE_FALTA: { texto: "Posible falta", tono: "naranja" },
  SIN_CATEGORIA: { texto: "Sin categoría", tono: "azul" },
  FERIADO: { texto: "Feriado", tono: "azul" },
  CIERRE_QUINCENA: { texto: "Cierre de quincena", tono: "azul" },
};
