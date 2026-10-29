"use strict";
// Ejecutar con:  cd backend && npm test      (usa node:test, sin dependencias)
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  crearConnie,
  validarSQL,
  limpiarMarkdown,
  normalizarHistorial,
  esquemaATexto,
  analizarResultado,
} = require("../connie");

// ---------------------------------------------------------------------------
// Guardián SQL
// ---------------------------------------------------------------------------
const PERMITIDAS = [
  "SELECT 1",
  "select * from estado_pedidos",
  "SELECT cliente, SUM(cantidad * punisiva) AS total FROM estado_pedidos WHERE estado != 'CANCELADO' GROUP BY cliente ORDER BY total DESC LIMIT 10;",
  "WITH x AS (SELECT op, SUM(cantidad) c FROM estado_pedidos GROUP BY op) SELECT * FROM x",
  "(SELECT 1) UNION (SELECT 2)",
  // Falsos positivos del filtro viejo: ahora se permiten
  "SELECT created_at, updated_at FROM registro_produccion",
  "SELECT * FROM registro_produccion WHERE created_at >= '2026-01-01'",
  "SELECT REPLACE(detalles, 'ML', 'MercadoLibre') FROM estado_pedidos",
  // Palabras peligrosas SOLO dentro de un texto no son un problema
  "SELECT * FROM estado_pedidos WHERE detalles LIKE '%drop table%' OR cliente = 'update; delete'",
  "SELECT `fecha`, `op` FROM `estado_pedidos`",
  "SELECT COUNT(*) FROM usuarios_externos_ficticios", // 'usuarios' != 'usuarios_externos_ficticios'
  "SELECT 'a''b' AS x",
];

const RECHAZADAS = [
  ["", "vacía"],
  ["DELETE FROM estado_pedidos", "no es select"],
  ["UPDATE estado_pedidos SET cantidad = 0", "update"],
  ["INSERT INTO estado_pedidos VALUES (1)", "insert"],
  ["DROP TABLE estado_pedidos", "drop"],
  ["SELECT 1; DROP TABLE x", "varias sentencias"],
  ["SELECT 1; SELECT 2", "varias sentencias"],
  ["WITH x AS (SELECT 1) DELETE FROM t", "with + delete"],
  ["SELECT * FROM t FOR UPDATE", "for update"],
  ["SELECT * FROM t LOCK IN SHARE MODE", "lock"],
  ["SELECT * FROM t INTO OUTFILE '/tmp/x'", "outfile"],
  ["SELECT 1 INTO @a", "into"],
  ["SELECT SLEEP(100)", "sleep"],
  ["SELECT BENCHMARK(100000000, MD5('a'))", "benchmark"],
  ["SELECT LOAD_FILE('/etc/passwd')", "load_file"],
  ["SELECT /*!50000 1 */", "comentario ejecutable"],
  ["SELECT 1 -- comentario", "comentario --"],
  ["SELECT 1 # comentario", "comentario #"],
  ["SELECT 'a\\' OR 1=1 -- '", "escape con barra"],
  ["SELECT 'sin cerrar", "comillas sin cerrar"],
  ["SELECT @@version", "variable del sistema"],
  ["SELECT * FROM information_schema.tables", "esquema del sistema"],
  ["SELECT * FROM mysql.user", "esquema mysql"],
  ["SET @a = 1", "set"],
  ["CALL algo()", "call"],
  ["SHOW TABLES", "show"],
  ["TABLE usuarios", "table stmt"],
  // Datos sensibles
  ["SELECT * FROM usuarios", "tabla usuarios"],
  ["SELECT email, password_hash FROM usuarios", "password_hash"],
  ["SELECT `password_hash` FROM `usuarios`", "con backticks"],
  ["SELECT * FROM conoflex_db.usuarios", "con base calificada"],
  ['SELECT "password_hash" FROM "usuarios"', "entre comillas dobles"],
  ["SELECT a FROM x UNION SELECT password_hash FROM usuarios", "union"],
  ["SELECT * FROM permisos_roles", "permisos"],
  ["SELECT * FROM roles", "roles"],
  ["SELECT 1\u0000", "byte nulo"],
];

for (const sql of PERMITIDAS) {
  test(`guardián permite: ${sql.slice(0, 70)}`, () => {
    const r = validarSQL(sql);
    assert.equal(r.ok, true, r.error);
  });
}
for (const [sql, motivo] of RECHAZADAS) {
  test(`guardián rechaza (${motivo}): ${sql.slice(0, 60).replace(/\u0000/g, "\\0")}`, () => {
    assert.equal(validarSQL(sql).ok, false);
  });
}

test("guardián: SELECT * se rechaza en tablas con columnas sensibles, pero no count(*) ni multiplicaciones", () => {
  const opciones = { tablasConColumnasSensibles: new Set(["solicitudes"]) };
  assert.equal(validarSQL("SELECT * FROM solicitudes", opciones).ok, false);
  assert.equal(validarSQL("SELECT s.* FROM solicitudes s", opciones).ok, false);
  assert.equal(validarSQL("SELECT id, nombre FROM solicitudes", opciones).ok, true);
  assert.equal(validarSQL("SELECT COUNT(*) FROM solicitudes", opciones).ok, true);
  assert.equal(validarSQL("SELECT id, a * b AS t FROM solicitudes", opciones).ok, true);
  assert.equal(validarSQL("SELECT * FROM otra_tabla", opciones).ok, true);
});

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
test("limpiarMarkdown deja texto plano", () => {
  const t = limpiarMarkdown("## Resumen\n**Total:** $ 1.000\n* uno\n* dos\n`x`");
  assert.equal(t, "Resumen\nTotal: $ 1.000\n- uno\n- dos\nx");
});

test("normalizarHistorial: alterna roles, empieza en user, termina en model y saca el mensaje actual", () => {
  const h = [
    { rol: "assistant", texto: "¡Hola! Soy Connie." },
    { rol: "user", texto: "ventas de ayer?" },
    { rol: "assistant", texto: "Ayer vendiste 10." },
    { rol: "user", texto: "y anteayer?" },
    { rol: "user", texto: "y la semana pasada?" }, // mensaje actual
  ];
  const t = normalizarHistorial(h, "y la semana pasada?");
  assert.deepEqual(
    t.map((x) => x.role),
    ["user", "model", "user", "model"].slice(0, t.length),
  );
  assert.equal(t[0].role, "user");
  assert.equal(t[t.length - 1].role, "model");
  assert.ok(!JSON.stringify(t).includes("la semana pasada"));
});

// ---------------------------------------------------------------------------
// Agente con Gemini y base simulados
// ---------------------------------------------------------------------------
function crearEntornoFalso({ onSelect }) {
  const registro = { conexiones: 0, consultas: [], destruidas: 0 };
  const columnas = [
    { tabla: "estado_pedidos", columna: "id", tipo: "int", largo: null, clave: "PRI", comentario: "" },
    { tabla: "estado_pedidos", columna: "cliente", tipo: "varchar", largo: 60, clave: "", comentario: "" },
    { tabla: "estado_pedidos", columna: "estado", tipo: "varchar", largo: 30, clave: "", comentario: "" },
    { tabla: "estado_pedidos", columna: "fecha", tipo: "date", largo: null, clave: "", comentario: "" },
    { tabla: "estado_pedidos", columna: "cantidad", tipo: "int", largo: null, clave: "", comentario: "" },
    { tabla: "usuarios", columna: "email", tipo: "varchar", largo: 100, clave: "", comentario: "" },
    { tabla: "usuarios", columna: "password_hash", tipo: "varchar", largo: 100, clave: "", comentario: "" },
  ];
  const pool = {
    async query(q) {
      const sql = typeof q === "string" ? q : q.sql;
      if (sql.includes("information_schema.COLUMNS")) return [columnas];
      if (sql.includes("information_schema.TABLES")) return [[{ tabla: "estado_pedidos", filas: 1200 }]];
      if (sql.includes("COUNT(DISTINCT")) {
        return [[{ d0: 40, d1: 3, min0: "2024-01-02", max0: "2026-10-28" }]];
      }
      if (sql.includes("SELECT DISTINCT")) return [[{ v: "PENDIENTE" }, { v: "ENTREGADO" }, { v: "CANCELADO" }]];
      throw new Error("query inesperada: " + sql);
    },
    async getConnection() {
      registro.conexiones++;
      return {
        async query(q) {
          const sql = typeof q === "string" ? q : q.sql;
          registro.consultas.push(sql);
          if (typeof q === "string") return [[], []];
          return onSelect(sql);
        },
        release() {},
        destroy() {
          registro.destruidas++;
        },
      };
    },
  };
  return { pool, registro };
}

function respuestaConLlamadas(llamadas) {
  return {
    functionCalls: llamadas,
    text: undefined,
    candidates: [
      { content: { role: "model", parts: llamadas.map((l) => ({ functionCall: l })) } },
    ],
  };
}
const respuestaTexto = (texto) => ({ functionCalls: undefined, text: texto, candidates: [{ content: { role: "model", parts: [{ text: texto }] } }] });

test("agente: se auto-corrige si el SQL falla y responde con texto plano", async () => {
  const { pool, registro } = crearEntornoFalso({
    onSelect: (sql) => {
      if (sql.includes("nombre_cliente")) {
        const e = new Error("Unknown column 'nombre_cliente' in 'field list'");
        throw e;
      }
      return [[["ACME", 120]], [{ name: "cliente" }, { name: "total" }]];
    },
  });
  const llamadasAlModelo = [];
  const guion = [
    respuestaConLlamadas([{ name: "consultar_sql", args: { consulta: "SELECT nombre_cliente, SUM(cantidad) FROM estado_pedidos GROUP BY 1", proposito: "ventas por cliente" } }]),
    respuestaConLlamadas([{ name: "consultar_sql", args: { consulta: "SELECT cliente, SUM(cantidad) AS total FROM estado_pedidos GROUP BY cliente", proposito: "ventas por cliente (corregida)" } }]),
    respuestaTexto("**ACME** compró 120 unidades."),
  ];
  const ai = {
    models: {
      async generateContent(req) {
        llamadasAlModelo.push(JSON.parse(JSON.stringify(req)));
        return guion.shift();
      },
    },
  };
  const connie = crearConnie({ pool, ai, obtenerDolar: async () => null });
  const r = await connie.responder({ mensaje: "¿Quién compró más?", historial: [] });

  assert.equal(r.respuesta, "ACME compró 120 unidades.");
  assert.equal(llamadasAlModelo.length, 3);
  assert.equal(r.consultas.length, 2);
  assert.match(r.consultas[0].error, /Unknown column/);
  assert.equal(r.consultas[1].error, undefined);
  assert.equal(registro.destruidas, 1, "la conexión que falló no vuelve al pool");

  // El error llegó al modelo para que lo corrija, y el esquema (sin datos sensibles) está en el prompt
  const tercera = JSON.stringify(llamadasAlModelo[2].contents);
  assert.match(tercera, /Unknown column/);
  const instrucciones = llamadasAlModelo[0].config.systemInstruction;
  assert.match(instrucciones, /estado_pedidos/);
  assert.match(instrucciones, /\{PENDIENTE\|ENTREGADO\|CANCELADO\}/);
  assert.match(instrucciones, /\[2024-01-02\.\.2026-10-28\]/);
  assert.ok(!/password_hash|usuarios/.test(instrucciones), "el esquema oculta lo sensible");
  assert.equal(llamadasAlModelo[0].config.thinkingConfig.thinkingBudget, 1024);
  assert.ok(llamadasAlModelo[0].config.httpOptions.timeout > 0);

  // Cada consulta corrió en una transacción de SOLO LECTURA
  assert.ok(registro.consultas.includes("START TRANSACTION READ ONLY"));
});

test("agente: una consulta prohibida NO toca la base y el modelo recibe el motivo", async () => {
  const { pool, registro } = crearEntornoFalso({ onSelect: () => { throw new Error("no debería ejecutarse"); } });
  const llamadasAlModelo = [];
  const guion = [
    respuestaConLlamadas([{ name: "consultar_sql", args: { consulta: "SELECT email, password_hash FROM usuarios" } }]),
    respuestaTexto("No puedo mostrar datos de usuarios."),
  ];
  const ai = { models: { async generateContent(req) { llamadasAlModelo.push(JSON.parse(JSON.stringify(req))); return guion.shift(); } } };
  const connie = crearConnie({ pool, ai, obtenerDolar: async () => null });
  const r = await connie.responder({ mensaje: "dame las contraseñas", historial: [] });
  assert.equal(registro.conexiones, 0, "ni siquiera pidió una conexión");
  assert.match(r.consultas[0].error, /Acceso restringido/);
  assert.match(JSON.stringify(llamadasAlModelo[1].contents), /Acceso restringido/);
});

test("agente: si agota las rondas fuerza una respuesta final sin herramientas", async () => {
  const { pool } = crearEntornoFalso({ onSelect: () => [[[1]], [{ name: "x" }]] });
  const llamadas = [];
  const ai = {
    models: {
      async generateContent(req) {
        llamadas.push(req);
        if (req.config.toolConfig?.functionCallingConfig?.mode === "NONE") {
          return respuestaTexto("Con lo reunido: 1.");
        }
        return respuestaConLlamadas([{ name: "consultar_sql", args: { consulta: "SELECT 1" } }]);
      },
    },
  };
  const connie = crearConnie({ pool, ai, obtenerDolar: async () => null });
  const r = await connie.responder({ mensaje: "pregunta infinita", historial: [] });
  assert.equal(r.respuesta, "Con lo reunido: 1.");
  assert.equal(llamadas.length, 6 + 1); // maxRondas + respuesta final forzada
});

test("agente: ejecuta consultas en paralelo y usa la cotización del dólar cacheada", async () => {
  const { pool } = crearEntornoFalso({ onSelect: () => [[[5]], [{ name: "n" }]] });
  let pedidosDolar = 0;
  const guion = [
    respuestaConLlamadas([
      { name: "consultar_sql", args: { consulta: "SELECT 5" } },
      { name: "cotizacion_dolar", args: {} },
    ]),
    respuestaConLlamadas([{ name: "cotizacion_dolar", args: {} }]),
    respuestaTexto("Listo."),
  ];
  const ai = { models: { async generateContent() { return guion.shift(); } } };
  const connie = crearConnie({ pool, ai, obtenerDolar: async () => { pedidosDolar++; return { venta: 1500 }; } });
  const r = await connie.responder({ mensaje: "x", historial: [] });
  assert.equal(r.respuesta, "Listo.");
  assert.equal(pedidosDolar, 1, "el dólar se consulta una vez y se cachea");
});

test("manejador: limita pedidos por usuario y valida el mensaje", async () => {
  const { pool } = crearEntornoFalso({ onSelect: () => [[[1]], [{ name: "x" }]] });
  const ai = { models: { async generateContent() { return respuestaTexto("ok"); } } };
  const connie = crearConnie({ pool, ai, obtenerDolar: async () => null });
  const handler = connie.manejador();
  const llamar = async (cuerpo, usuario = { id: 77 }) => {
    let estado = 200;
    let datos;
    await handler(
      { body: cuerpo, user: usuario },
      { status(c) { estado = c; return this; }, json(d) { datos = d; return this; } },
    );
    return { estado, datos };
  };
  assert.equal((await llamar({ mensaje: "   " })).estado, 400);
  for (let i = 0; i < 20; i++) assert.equal((await llamar({ mensaje: "hola" })).estado, 200);
  const excedido = await llamar({ mensaje: "hola" });
  assert.equal(excedido.estado, 429);
  assert.equal((await llamar({ mensaje: "hola" }, { id: 88 })).estado, 200, "otro usuario no se ve afectado");
});

// ---------------------------------------------------------------------------
// Rigor: no concluir "no hay datos" con un filtro inventado
// ---------------------------------------------------------------------------
const col = (nombre, valores = null, distintos = valores ? valores.length : 0, tipo = "varchar") => ({
  nombre, tipo, largo: 30, clave: "", comentario: "", valores, rango: null, distintos,
});

test("esquema: lista hasta 20 valores, marca ~N si hay más, y no ensucia columnas casi únicas", () => {
  const quince = Array.from({ length: 15 }, (_, i) => `E${i}`);
  const texto = esquemaATexto({
    tablas: new Map([["t", { filas: 10, columnas: [
      col("estado", quince),
      col("cliente", null, 35),
      col("op", null, 3000),
    ] }]]),
  });
  assert.match(texto, /estado texto\{E0\|E1\|/);
  assert.match(texto, /E14\}/);
  assert.match(texto, /cliente texto\{~35 valores distintos\}/);
  assert.ok(!/op texto\{/.test(texto), "columnas casi únicas no llevan marca");
});

const datosEstados = {
  tablas: new Map([["estado_pedidos", { filas: 10, columnas: [col("estado", ["PENDIENTE", "ENTREGADO", "CANCELADO"])] }]]),
};

test("analizarResultado: valor inexistente + resultado NULL -> avisa con los valores reales", () => {
  const av = analizarResultado({
    filas: [[null, null]],
    sql: "SELECT SUM(cantidad) FROM estado_pedidos WHERE estado = 'COMPLETADO'",
    datos: datosEstados,
  });
  assert.equal(av.length, 2);
  assert.match(av[0], /'COMPLETADO' NO existe en la columna estado/);
  assert.match(av[0], /PENDIENTE, ENTREGADO, CANCELADO/);
  assert.match(av[1], /vacío o en cero\/NULL/);
});

test("analizarResultado: detecta también IN (...) y backticks, sin importar mayúsculas", () => {
  const av = analizarResultado({
    filas: [],
    sql: "SELECT 1 FROM estado_pedidos WHERE `estado` IN ('entregado', 'FACTURADO')",
    datos: datosEstados,
  });
  assert.ok(av.some((a) => /'FACTURADO' NO existe/.test(a)));
  assert.ok(!av.some((a) => /'entregado' NO existe/.test(a)), "entregado sí existe (sin distinguir mayúsculas)");
});

test("analizarResultado: misma columna en otra tabla (sin lista) no anula el aviso de la tabla consultada", () => {
  const datos = { tablas: new Map([
    ["estado_pedidos", { filas: 10, columnas: [col("estado", ["PENDIENTE", "ENTREGADO"])] }],
    ["ordenes_trabajo", { filas: 0, columnas: [col("estado", null, 0)] }],
  ]) };
  const av = analizarResultado({ filas: [[null]], sql: "SELECT SUM(x) FROM estado_pedidos WHERE estado = 'COMPLETADO'", datos });
  assert.match(av[0], /'COMPLETADO' NO existe en la columna estado\. Valores reales de estado: PENDIENTE, ENTREGADO/);
  const otra = analizarResultado({ filas: [[null]], sql: "SELECT SUM(x) FROM ordenes_trabajo WHERE estado = 'COMPLETADO'", datos });
  assert.ok(!otra.some((a) => /NO existe/.test(a)), "sin lista conocida no se acusa");
});

test("analizarResultado: valor válido con resultado 0 -> solo el aviso general (sin acusar al valor)", () => {
  const av = analizarResultado({ filas: [[0]], sql: "SELECT COUNT(*) FROM estado_pedidos WHERE estado = 'ENTREGADO'", datos: datosEstados });
  assert.equal(av.length, 1);
  assert.ok(!/NO existe/.test(av[0]));
});

test("analizarResultado: resultado con datos -> sin avisos", () => {
  assert.deepEqual(analizarResultado({ filas: [[120, 5000]], sql: "SELECT 1 WHERE estado = 'COMPLETADO'", datos: datosEstados }), []);
  assert.deepEqual(analizarResultado({ filas: [["ML", 0], ["Directa", 3]], sql: "SELECT 1", datos: datosEstados }), []);
});

test("analizarResultado: si la columna existe en otra tabla sin lista completa, no acusa (evita falsas alarmas)", () => {
  const datos = { tablas: new Map([
    ["a", { filas: 1, columnas: [col("estado", ["X", "Y"])] }],
    ["b", { filas: 1, columnas: [col("estado", null, 50)] }],
  ]) };
  const av = analizarResultado({ filas: [], sql: "SELECT 1 FROM b WHERE estado = 'Z'", datos });
  assert.ok(!av.some((a) => /NO existe/.test(a)));
});

test("agente: el caso 'ventas de la semana' con estado inventado -> recibe la pista y se corrige", async () => {
  const { pool } = crearEntornoFalso({
    onSelect: (sql) => {
      if (sql.includes("'COMPLETADO'")) return [[[null, null]], [{ name: "unidades" }, { name: "total" }]];
      return [[[120, 8450000]], [{ name: "unidades" }, { name: "total" }]];
    },
  });
  const pedidos = [];
  const guion = [
    respuestaConLlamadas([{ name: "consultar_sql", args: { proposito: "ventas de la semana", consulta: "SELECT SUM(cantidad), SUM(punisiva) FROM estado_pedidos WHERE fecha >= '2026-10-26' AND estado = 'COMPLETADO'" } }]),
    respuestaConLlamadas([{ name: "consultar_sql", args: { proposito: "ventas de la semana (sin cancelados)", consulta: "SELECT SUM(cantidad), SUM(cantidad * punisiva) FROM estado_pedidos WHERE fecha >= '2026-10-26' AND estado <> 'CANCELADO'" } }]),
    respuestaTexto("Del lunes 26 al jueves 29 se vendieron 120 unidades por $ 8.450.000."),
  ];
  const ai = { models: { async generateContent(req) { pedidos.push(JSON.parse(JSON.stringify(req))); return guion.shift(); } } };
  const connie = crearConnie({ pool, ai, obtenerDolar: async () => null });
  const r = await connie.responder({ mensaje: "Dame las ventas de la semana", historial: [] });

  // Lo que el modelo vio tras su primera consulta fallida:
  const visto = JSON.stringify(pedidos[1].contents);
  assert.match(visto, /COMPLETADO/);
  assert.match(visto, /NO existe en la columna estado/);
  assert.match(visto, /PENDIENTE, ENTREGADO, CANCELADO/);
  assert.match(visto, /Antes de concluir que no hay datos/);
  // Y la segunda consulta (con datos) no trae advertencias
  const ultimoResultado = pedidos[2].contents[pedidos[2].contents.length - 1];
  assert.ok(!JSON.stringify(ultimoResultado).includes("advertencias"));
  assert.equal(r.consultas.length, 2);
  assert.match(r.respuesta, /120 unidades/);
  // Las pautas generales están en el prompt, sin fórmulas del negocio
  const prompt = pedidos[0].config.systemInstruction;
  assert.match(prompt, /NUNCA supongas el valor de una columna de estado/);
  assert.match(prompt, /resultado vacío, en 0 o en NULL/);
  assert.match(prompt, /unitaria o ya es total/);
  assert.ok(!/estado\s*!=\s*'CANCELADO'|cantidad \* punisiva/.test(prompt), "sin fórmulas del negocio escritas");
});
