"use strict";
// Declaraciones de las herramientas de liquidación, TEXTUALES de Connie (connie.js): las mismas funciones
// (liquidarDesdeBD / simularTurno / calcular) con los mismos parámetros, para que Lía liquide igual que Connie.
const HERRAMIENTAS_LIQUIDACION = [
      {
        name: "liquidar_horas",
        description:
          "Liquida horas trabajadas y lo que corresponde cobrar, desde un día hasta el mes entero, con las reglas de Conoflex (diurna/nocturna, jornada de 9 hs, extras al 50% y 100%) y el valor hora de la categoría de cada operario. Indicá UNA forma de elegir el período: 'fechas' (días sueltos), 'desde'+'hasta' (un día o un tramo), o 'mes' (con 'quincena' opcional). Todas las puntas son inclusive. Con 'operario' devuelve el detalle por día con el porqué de cada tramo; sin 'operario' liquida a todos los que tienen fichadas (con solo_con_categoria=true, solo a los que tienen categoría) y devuelve, por operario, totales por tipo de hora, importe de normales y de extras, y los días.",
        parameters: {
          type: "OBJECT",
          properties: {
            operario: { type: "STRING", description: "Nombre (o parte) del operario. Omitir para ver a todos." },
            mes: { type: "STRING", description: "Mes AAAA-MM, por ejemplo 2026-10." },
            quincena: { type: "INTEGER", description: "Con 'mes': 1 = del 1 al 15 (inclusive); 2 = del 16 al último día del mes (inclusive). Omitir para el mes entero." },
            desde: { type: "STRING", description: "Primer día AAAA-MM-DD (inclusive)." },
            hasta: { type: "STRING", description: "Último día AAAA-MM-DD (inclusive). Igual a 'desde' para un solo día." },
            fechas: { type: "ARRAY", items: { type: "STRING" }, description: "Días sueltos AAAA-MM-DD; se desglosa cada uno." },
            solo_extras: { type: "BOOLEAN", description: "true cuando piden liquidar SOLO las horas extra: el resultado trae únicamente horas y valor de extras." },
            solo_con_categoria: { type: "BOOLEAN", description: "Sin 'operario': true = liquidar solo a los operarios que tienen categoría asignada." },
            detalle: { type: "STRING", description: "'completo' = tramos de cada día; 'compacto' = solo totales por día. Por defecto se elige solo." },
          },
        },
      },
      {
        name: "simular_turno",
        description:
          "Calcula con las mismas reglas cuánto corresponde cobrar por UN turno hipotético (fecha, hora de entrada y de salida). Si la salida es menor o igual a la entrada, el turno termina al día siguiente. Pasá valor_hora o un operario (usa su categoría).",
        parameters: {
          type: "OBJECT",
          properties: {
            fecha: { type: "STRING", description: "Día de ingreso AAAA-MM-DD." },
            entrada: { type: "STRING", description: "HH:MM 24 hs." },
            salida: { type: "STRING", description: "HH:MM 24 hs." },
            valor_hora: { type: "NUMBER", description: "Valor de la hora diurna en pesos." },
            sueldo_mensual: { type: "NUMBER", description: "Alternativa a valor_hora: sueldo mensual de una categoría mensual (la hora ordinaria sale de dividirlo por 180)." },
            operario: { type: "STRING", description: "Para usar el valor hora de su categoría." },
            feriado: { type: "BOOLEAN", description: "Tratar ese día como feriado." },
          },
          required: ["fecha", "entrada", "salida"],
        },
      },
      {
        name: "calculadora",
        description:
          "Resuelve una cuenta exacta (+ - * / ^ % y paréntesis), por ejemplo '1250000 * 1,15 / 3'. Usala para porcentajes, proyecciones y cualquier aritmética que no sea una consulta SQL.",
        parameters: {
          type: "OBJECT",
          properties: { expresion: { type: "STRING" } },
          required: ["expresion"],
        },
      },
];

module.exports = { HERRAMIENTAS_LIQUIDACION };
