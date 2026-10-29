"use strict";
// Gráficos que Connie puede devolver. La pantalla los dibuja; acá solo se
// validan y normalizan para que nunca llegue algo roto o gigante al frontend.

const TIPOS = new Set(["barras", "barras_horizontales", "lineas", "torta"]);
const MAX_PUNTOS = 40;
const MAX_SERIES = 6;
const MAX_TORTA = 12;

const texto = (v, max) => String(v ?? "").slice(0, max);

function normalizarGrafico({ tipo, titulo, etiquetas, series, unidad }) {
  if (!TIPOS.has(tipo)) {
    return { error: `Tipo de gráfico inválido. Usá: ${[...TIPOS].join(", ")}.` };
  }
  if (!Array.isArray(etiquetas) || !etiquetas.length) return { error: "Faltan las etiquetas." };
  if (!Array.isArray(series) || !series.length) return { error: "Falta al menos una serie de valores." };

  const n = Math.min(etiquetas.length, MAX_PUNTOS);
  const seriesOk = [];
  for (const s of series.slice(0, MAX_SERIES)) {
    const valores = (Array.isArray(s?.valores) ? s.valores : []).slice(0, n).map((v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    });
    if (valores.length !== n) return { error: "Cada serie debe tener un valor por cada etiqueta." };
    if (valores.every((v) => v === null)) return { error: "Una serie no tiene valores numéricos." };
    seriesOk.push({ nombre: texto(s.nombre, 40), valores });
  }

  let labels = etiquetas.slice(0, n).map((e) => texto(e, 40));
  let finalSeries = seriesOk;
  if (tipo === "torta") {
    // Una sola serie, solo positivos; lo que sobra se agrupa en "Otros".
    const pares = labels
      .map((l, i) => [l, seriesOk[0].valores[i]])
      .filter(([, v]) => v !== null && v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!pares.length) return { error: "La torta necesita valores positivos." };
    const top = pares.slice(0, MAX_TORTA - 1);
    const resto = pares.slice(MAX_TORTA - 1).reduce((a, [, v]) => a + v, 0);
    if (resto > 0) top.push(["Otros", resto]);
    labels = top.map(([l]) => l);
    finalSeries = [{ nombre: seriesOk[0].nombre, valores: top.map(([, v]) => v) }];
  }
  return {
    grafico: {
      tipo,
      titulo: texto(titulo, 120),
      unidad: texto(unidad, 12),
      etiquetas: labels,
      series: finalSeries,
    },
  };
}

/** Primera columna = etiquetas; el resto de columnas numéricas = series. */
function graficoDesdeTabla({ tipo, titulo, unidad, columnas, filas }) {
  if (!Array.isArray(columnas) || columnas.length < 2) {
    return { error: "La consulta del gráfico necesita al menos 2 columnas: etiqueta y valor." };
  }
  if (!Array.isArray(filas) || !filas.length) return { error: "La consulta no devolvió filas para graficar." };
  const etiquetas = filas.map((f) => (f[0] === null ? "(sin dato)" : f[0]));
  const series = columnas.slice(1).map((nombre, i) => ({
    nombre,
    valores: filas.map((f) => f[i + 1]),
  }));
  return normalizarGrafico({ tipo, titulo, unidad, etiquetas, series });
}

module.exports = { normalizarGrafico, graficoDesdeTabla, TIPOS, MAX_PUNTOS };
