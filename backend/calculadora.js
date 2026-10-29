"use strict";
// Calculadora segura (sin eval): + - * / ^ % (módulo no; % = porcentaje), paréntesis y decimales.
// Para que Connie no haga aritmética "de cabeza" cuando el cálculo no es una consulta SQL.

function calcular(expresion) {
  const src = String(expresion || "").replace(/\s+/g, "").replace(/,/g, ".");
  if (!src || src.length > 200) return { error: "Expresión vacía o demasiado larga." };
  if (!/^[0-9+\-*/().^%]+$/.test(src)) return { error: "Solo se permiten números y + - * / ^ % ( )." };
  let i = 0;
  const peek = () => src[i];
  function numero() {
    const m = src.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (!m) throw new Error("Se esperaba un número");
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function primario() {
    if (peek() === "(") {
      i++;
      const v = suma();
      if (peek() !== ")") throw new Error("Falta cerrar un paréntesis");
      i++;
      return v;
    }
    if (peek() === "-") { i++; return -potencia(); }
    if (peek() === "+") { i++; return potencia(); }
    return numero();
  }
  function postfijo() {
    let v = primario();
    while (peek() === "%") { i++; v = v / 100; } // 15% = 0,15
    return v;
  }
  function potencia() {
    const base = postfijo();
    if (peek() === "^") { i++; return Math.pow(base, potencia()); }
    return base;
  }
  function producto() {
    let v = potencia();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const d = potencia();
      if (op === "/" && d === 0) throw new Error("División por cero");
      v = op === "*" ? v * d : v / d;
    }
    return v;
  }
  function suma() {
    let v = producto();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const d = producto();
      v = op === "+" ? v + d : v - d;
    }
    return v;
  }
  try {
    const r = suma();
    if (i !== src.length) throw new Error("Expresión inválida");
    if (!Number.isFinite(r)) throw new Error("Resultado no finito");
    return { resultado: Math.round((r + Number.EPSILON) * 1e6) / 1e6 };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { calcular };
