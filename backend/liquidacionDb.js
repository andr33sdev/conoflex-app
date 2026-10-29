"use strict";
// Carga de datos (fichadas, feriados, ajustes, escala UOYEP) y liquidación.
const { liquidarMes, redondear } = require("./liquidacion");

const sinAcentos = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const pad = (n) => String(n).padStart(2, "0");

function rangoMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  const ini = new Date(y, m - 1, 1);
  const fin = new Date(y, m, 1);
  const f = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // 2 días de margen: un turno nocturno puede cruzar el borde del mes
  const antes = new Date(ini.getTime() - 2 * 86400000);
  const despues = new Date(fin.getTime() + 2 * 86400000);
  return { desde: `${f(antes)} 00:00:00`, hasta: `${f(despues)} 23:59:59` };
}

/** Elige el período de la escala: el del mes, o el último anterior, o el más nuevo. */
function elegirPeriodo(periodos, mes) {
  const lista = periodos.map((p) => p.periodo).sort();
  if (lista.includes(mes)) return mes;
  const anteriores = lista.filter((p) => p <= mes);
  return anteriores.length ? anteriores[anteriores.length - 1] : lista[lista.length - 1] || null;
}

async function liquidarDesdeBD(pool, { operario, mes }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ""))) {
    return { error: "El mes debe tener formato AAAA-MM (por ejemplo 2026-10)." };
  }
  const { desde, hasta } = rangoMes(mes);
  const [filasFichadas] = await pool.query(
    "SELECT nombre, tipo, fecha_hora FROM fichadas WHERE fecha_hora BETWEEN ? AND ? ORDER BY fecha_hora",
    [desde, hasta],
  );
  const nombres = [...new Set(filasFichadas.map((f) => f.nombre))].sort();

  let elegidos = nombres;
  if (operario) {
    const q = sinAcentos(operario);
    const coinciden = nombres.filter((n) => sinAcentos(n).includes(q));
    if (!coinciden.length) {
      return { error: `No hay fichadas de "${operario}" en ${mes}.`, operarios_con_fichadas: nombres.slice(0, 60) };
    }
    if (coinciden.length > 1 && !coinciden.some((n) => sinAcentos(n) === q)) {
      return { error: `"${operario}" coincide con varios operarios. Indicá cuál.`, coincidencias: coinciden };
    }
    elegidos = coinciden.filter((n) => sinAcentos(n) === q).length ? coinciden.filter((n) => sinAcentos(n) === q) : coinciden;
  }
  if (!elegidos.length) return { error: `No hay fichadas en ${mes}.` };

  const [feriadosRows] = await pool.query(
    "SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha FROM fichero_feriados",
  );
  const feriados = new Set(feriadosRows.map((r) => r.fecha));
  const [ajustesRows] = await pool.query(
    "SELECT nombre_operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora_inicio_pactada, '%H:%i') AS hora_inicio_pactada, horas_normales, todas_extra FROM fichero_ajustes_dias",
  );
  const [asigRows] = await pool.query("SELECT nombre_operario, categoria_codigo FROM fichero_operarios_categorias");
  const [catRows] = await pool.query("SELECT codigo, nombre FROM fichero_uoyep_categorias");
  const [perRows] = await pool.query("SELECT periodo, label FROM fichero_uoyep_periodos");
  const periodo = elegirPeriodo(perRows, mes);
  const [valRows] = periodo
    ? await pool.query(
        "SELECT categoria_codigo, valor_hora, suma_no_remunerativa FROM fichero_uoyep_valores WHERE periodo = ?",
        [periodo],
      )
    : [[]];

  const valorDe = new Map(valRows.map((v) => [v.categoria_codigo, v]));
  const asigDe = new Map(asigRows.map((a) => [a.nombre_operario, a.categoria_codigo]));
  const nombreCat = new Map(catRows.map((c) => [c.codigo, c.nombre]));

  const resultados = elegidos.map((nombre) => {
    const ajustes = {};
    for (const a of ajustesRows) {
      if (a.nombre_operario !== nombre) continue;
      ajustes[a.fecha] = {
        horaInicio: a.hora_inicio_pactada || null,
        horasNormales: a.horas_normales != null ? Number(a.horas_normales) : null,
        todasExtra: !!a.todas_extra,
      };
    }
    const codigo = asigDe.get(nombre) || null;
    const val = codigo ? valorDe.get(codigo) : null;
    const liq = liquidarMes({
      mes,
      fichadas: filasFichadas.filter((f) => f.nombre === nombre),
      feriados,
      ajustes,
      valorHora: val ? Number(val.valor_hora) : 0,
      sumaNoRemunerativa: val && val.suma_no_remunerativa != null ? Number(val.suma_no_remunerativa) : null,
    });
    return {
      operario: nombre,
      categoria: codigo ? nombreCat.get(codigo) || codigo : "SIN CATEGORÍA ASIGNADA",
      ...liq,
      ...(val ? {} : { aviso: "El operario no tiene categoría UOYEP asignada o la escala no tiene valor para este período: los importes salen en 0." }),
    };
  });

  const base = {
    periodo_escala_usado: periodo,
    nota_reglas:
      "Reglas del módulo Fichero: media hora cumplida, jornada normal de 9 hs (o la pactada en el día), sábados diurnos y feriados 100% extra, extras al valor hora x1,5. Las extras de cada día se calculan todas; en la pantalla el administrador tilda cuáles liquidar.",
  };
  if (operario) {
    const r = resultados[0];
    return { ...base, ...r };
  }
  // Resumen de todos (sin detalle diario)
  return {
    ...base,
    mes,
    operarios: resultados.map(({ detalle_dias, ...resto }) => resto),
    total_importe: redondear(resultados.reduce((a, r) => a + r.importe_total, 0)),
  };
}

module.exports = { liquidarDesdeBD, elegirPeriodo, rangoMes };
