// Qué semielaborados tienen modelo 3D y de qué color se pintan.
// Un solo archivo por producto: el color se aplica por código (ver recolorTextura.js).

export const COLORES = {
  naranja: { nombre: "Naranja", hex: "#e16c22", sufijos: ["NA"] },
  rojo: { nombre: "Rojo", hex: "#d62828", sufijos: ["RO"] },
  amarillo: { nombre: "Amarillo", hex: "#facc15", sufijos: ["AM"] },
  negro: { nombre: "Negro", hex: "#161616", sufijos: ["NE", "NG"] },
  azul: { nombre: "Azul", hex: "#1d4ed8", sufijos: ["AZ"] },
  verde: { nombre: "Verde", hex: "#16a34a", sufijos: ["VE"] },
};

const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Color del semielaborado: primero por el nombre ("Econo Naranja"), si no por las dos letras finales del código (2071RO). */
export function colorDe(item) {
  const nombre = sinTildes(item?.nombre);
  for (const [k, c] of Object.entries(COLORES)) if (new RegExp(`\\b${k}\\b`).test(nombre)) return c;
  const fin = String(item?.codigo || "").toUpperCase().slice(-2);
  return Object.values(COLORES).find((c) => c.sufijos.includes(fin)) || null;
}

export const MODELOS = [
  { id: "econo-70", titulo: "Econo", archivo: "/models/econo-70.glb", coincide: (item) => /^2071/i.test(String(item?.codigo || "").trim()) },
];

/** { modelo, color } si el semielaborado tiene modelo 3D y se conoce su color; si no, null (no se muestra nada). */
export function modeloDe(item) {
  const modelo = MODELOS.find((m) => m.coincide(item));
  const color = colorDe(item);
  return modelo && color ? { modelo, color } : null;
}
