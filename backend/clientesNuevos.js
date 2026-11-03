"use strict";
// Clientes nuevos: con un botón, la IA sale a buscar en internet (Google Search) novedades que sean oportunidades de venta
// en toda la Argentina: licitaciones y compras públicas, obras viales y empresas del rubro. Devuelve un reporte ordenado.
// Solo usa información pública que encuentra; si no encuentra un contacto lo dice, no lo inventa.

const SEGMENTOS = [
  {
    id: "licitaciones",
    titulo: "Licitaciones y compras públicas",
    busqueda:
      "Licitaciones, concursos de precios y compras públicas ABIERTAS o RECIENTES en Argentina (municipios, provincias, Vialidad Nacional y provincial, concesionarias viales, organismos de tránsito y seguridad vial) donde se compren productos como los nuestros: conos, topes, separadores de carril, delineadores, topes de estacionamiento, bandas reductoras de velocidad, señalización vial. Revisá portales de compras (COMPR.AR, portales provinciales y municipales, Boletín Oficial) y noticias.",
  },
  {
    id: "obras",
    titulo: "Obras viales y proyectos nuevos",
    busqueda:
      "Obras viales, repavimentaciones, autopistas, rutas, ciclovías, playas de estacionamiento, parques industriales, aeropuertos y puertos ANUNCIADAS o EN EJECUCIÓN en Argentina, que van a necesitar señalización y seguridad vial temporal o permanente. Indicá quién es la empresa contratista o el organismo a cargo, para poder venderles.",
  },
  {
    id: "empresas",
    titulo: "Empresas del rubro",
    busqueda:
      "Empresas argentinas que podrían ser clientes o revendedores de productos de seguridad vial: constructoras viales, empresas de señalización, distribuidores y mayoristas de seguridad vial, corralones y ferreterías industriales grandes, concesionarias de peaje, empresas de logística y de estacionamiento. Priorizá las que aparezcan en noticias recientes, ampliaciones o contrataciones.",
  },
];

const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function armarBusqueda(segmento, { productos = [], clientes = [], fecha = hoyAR() } = {}) {
  return [
    `Hoy es ${fecha}. Trabajás para una fábrica argentina de productos plásticos de seguridad vial (inyección y rotomoldeo).`,
    productos.length ? `Lo que fabrica: ${productos.slice(0, 40).join(", ")}.` : "Fabrica bases de conos, topes, separadores de carril, topes de estacionamiento y puntas de cono.",
    `Tarea: encontrar NOVEDADES DEL MOMENTO (últimos 60 días, o abiertas hoy) en TODA la Argentina. ${segmento.busqueda}`,
    "Para cada oportunidad devolvé: nombre de la organización o empresa, provincia/ciudad, qué pasó o por qué es una oportunidad, fecha (publicación o cierre si es licitación), qué productos de la fábrica le podemos ofrecer y contacto o dato público para llegar (web, mail o teléfono SOLO si figura en las fuentes).",
    "Reglas: usá solo lo que encuentres en fuentes reales; no inventes empresas, fechas ni contactos; si un dato no figura escribí 'no figura'. Prefiero 6 a 10 oportunidades verificables antes que muchas dudosas.",
    clientes.length ? `No incluyas a estas empresas, que YA son clientes: ${clientes.slice(0, 120).join(", ")}.` : "",
    "Respondé en español, en una lista, sin introducción.",
  ].filter(Boolean).join("\n\n");
}

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    resumen: { type: "STRING", description: "2 o 3 frases: qué es lo más importante que apareció hoy." },
    oportunidades: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          segmento: { type: "STRING", description: "licitaciones, obras o empresas" },
          titulo: { type: "STRING", description: "Una línea que diga qué es (ej: 'Licitación de conos y balizas para rutas provinciales')." },
          organizacion: { type: "STRING" },
          provincia: { type: "STRING" },
          que_paso: { type: "STRING", description: "Por qué es una oportunidad, en 1 o 2 frases." },
          producto: { type: "STRING", description: "Qué productos de la fábrica ofrecerle." },
          fecha: { type: "STRING", description: "Fecha relevante (cierre de la licitación, inicio de obra, noticia). Vacío si no figura." },
          contacto: { type: "STRING", description: "Contacto o web pública; 'no figura' si no se encontró." },
          fuente: { type: "STRING", description: "Nombre del sitio o medio donde se vio." },
          prioridad: { type: "INTEGER", description: "1 = ir ya, 2 = interesante, 3 = a futuro." },
          confianza: { type: "STRING", description: "alta, media o baja según cuán verificable es el dato." },
        },
        required: ["segmento", "titulo", "organizacion", "que_paso", "prioridad"],
      },
    },
  },
  required: ["resumen", "oportunidades"],
};

function armarEstructura(textos) {
  const cuerpo = textos.map((t) => `### ${t.titulo}\n${t.texto}`).join("\n\n");
  return `Convertí estos resultados de búsqueda en datos estructurados. Quedate SOLO con lo que está en el texto (no agregues ni inventes nada). Sacá duplicados. Ordená de más a menos prioridad: 1 si hay una fecha cercana o una compra concreta, 2 si es una empresa o proyecto interesante, 3 si es a futuro o dudoso. Si un dato no figura dejalo vacío o 'no figura'.\n\n${cuerpo}`;
}

function extraerJSON(texto) {
  const t = String(texto || "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        /* cae al error de abajo */
      }
    }
  }
  return null;
}

function fuentesDe(respuesta) {
  const trozos = respuesta?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const vistos = new Set();
  const salida = [];
  for (const c of trozos) {
    const url = c?.web?.uri;
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    salida.push({ titulo: String(c.web.title || url).slice(0, 120), url });
  }
  return salida;
}

const textoDe = (r) => {
  try {
    return typeof r?.text === "string" ? r.text : r?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  } catch {
    return "";
  }
};

const clave = (o) => sinAcentos(`${o.organizacion}|${o.titulo}`).replace(/[^a-z0-9|]+/g, " ").trim();

/**
 * Corre la búsqueda completa. progreso(texto) avisa en qué paso va.
 * deps: { ai, modelo, productos, clientes, anteriores: [claves de la búsqueda previa], progreso }
 */
async function ejecutarBusqueda({ ai, modelo = "gemini-2.5-flash", productos = [], clientes = [], anteriores = [], progreso = () => {}, fecha = hoyAR() }) {
  progreso("Buscando en internet: licitaciones, obras y empresas…");
  const resultados = await Promise.allSettled(
    SEGMENTOS.map(async (s) => {
      const r = await ai.models.generateContent({
        model: modelo,
        contents: [{ role: "user", parts: [{ text: armarBusqueda(s, { productos, clientes, fecha }) }] }],
        config: { tools: [{ googleSearch: {} }], temperature: 0.2, httpOptions: { timeout: 120000 } },
      });
      return { id: s.id, titulo: s.titulo, texto: textoDe(r).trim(), fuentes: fuentesDe(r) };
    }),
  );
  const buenos = resultados.filter((r) => r.status === "fulfilled" && r.value.texto).map((r) => r.value);
  const fallidos = SEGMENTOS.filter((s, i) => resultados[i].status === "rejected" || !resultados[i].value?.texto).map((s) => s.titulo);
  if (!buenos.length) {
    const causa = resultados.find((r) => r.status === "rejected")?.reason?.message;
    throw new Error(`No se pudo buscar en internet${causa ? `: ${String(causa).slice(0, 160)}` : "."}`);
  }

  progreso("Ordenando lo encontrado…");
  const est = await ai.models.generateContent({
    model: modelo,
    contents: [{ role: "user", parts: [{ text: armarEstructura(buenos) }] }],
    config: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0, httpOptions: { timeout: 90000 } },
  });
  const datos = extraerJSON(textoDe(est));
  if (!datos || !Array.isArray(datos.oportunidades)) throw new Error("La búsqueda terminó pero no pude ordenar los resultados. Probá de nuevo.");

  const previas = new Set(anteriores);
  const vistas = new Set();
  const oportunidades = [];
  for (const o of datos.oportunidades) {
    const k = clave(o);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    const prioridad = [1, 2, 3].includes(Number(o.prioridad)) ? Number(o.prioridad) : 2;
    oportunidades.push({ ...o, prioridad, nueva: !previas.has(k), clave: k });
  }
  oportunidades.sort((a, b) => a.prioridad - b.prioridad || Number(b.nueva) - Number(a.nueva));

  return {
    resumen: String(datos.resumen || "").slice(0, 600),
    oportunidades,
    fuentes: buenos.flatMap((b) => b.fuentes.map((f) => ({ ...f, segmento: b.id }))),
    segmentos_sin_resultado: fallidos,
    fecha,
  };
}

async function asegurarTablaClientesNuevos(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS clientes_nuevos_busquedas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      estado VARCHAR(15) NOT NULL DEFAULT 'BUSCANDO',
      progreso VARCHAR(200) NULL,
      resultado LONGTEXT NULL,
      error VARCHAR(500) NULL,
      creado_por VARCHAR(120) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      terminado_at DATETIME NULL
    )`);
  // Si el servidor se reinició a mitad de una búsqueda, queda como cortada.
  await db.query("UPDATE clientes_nuevos_busquedas SET estado = 'ERROR', error = 'Se cortó por un reinicio del servidor.', terminado_at = NOW() WHERE estado = 'BUSCANDO'");
}

const leerFila = (f) => {
  if (!f) return null;
  let resultado = null;
  try {
    resultado = f.resultado ? JSON.parse(f.resultado) : null;
  } catch {
    resultado = null;
  }
  return { id: f.id, estado: f.estado, progreso: f.progreso, error: f.error, creado_por: f.creado_por, created_at: f.created_at, terminado_at: f.terminado_at, resultado };
};

async function ultimaBusqueda(db) {
  const [r] = await db.query("SELECT * FROM clientes_nuevos_busquedas ORDER BY id DESC LIMIT 1");
  return leerFila(r[0]);
}

async function contextoDeLaEmpresa(db) {
  let productos = [];
  let clientes = [];
  try {
    const [p] = await db.query("SELECT DISTINCT nombre FROM productos WHERE nombre IS NOT NULL AND nombre <> '' ORDER BY nombre LIMIT 60");
    productos = p.map((x) => x.nombre);
  } catch {
    /* sin catálogo cargado */
  }
  try {
    const [c] = await db.query("SELECT cliente, COUNT(*) AS n FROM pedidos WHERE cliente IS NOT NULL AND cliente <> '' GROUP BY cliente ORDER BY n DESC LIMIT 150");
    clientes = c.map((x) => x.cliente);
  } catch {
    /* sin pedidos */
  }
  return { productos, clientes };
}

const EN_CURSO_MAX_MS = 10 * 60 * 1000;

function registrarRutasClientesNuevos(app, { db, requirePermiso, nombreDeUsuario, ai, modelo }) {
  const PERMISO = requirePermiso("clientes-nuevos");

  app.get("/api/clientes-nuevos/ultima", PERMISO, async (req, res) => {
    try {
      res.json((await ultimaBusqueda(db)) || null);
    } catch (e) {
      console.error("[clientes-nuevos] ultima:", e.message);
      res.status(500).json({ error: "No pude cargar la última búsqueda." });
    }
  });

  app.post("/api/clientes-nuevos/buscar", PERMISO, async (req, res) => {
    try {
      const actual = await ultimaBusqueda(db);
      if (actual?.estado === "BUSCANDO" && Date.now() - new Date(actual.created_at).getTime() < EN_CURSO_MAX_MS) return res.status(202).json({ id: actual.id, ya_buscando: true });
      const quien = (await nombreDeUsuario(req)) || "Usuario";
      const [ins] = await db.query("INSERT INTO clientes_nuevos_busquedas (estado, progreso, creado_por) VALUES ('BUSCANDO', 'Empezando…', ?)", [quien]);
      const id = ins.insertId;
      res.status(202).json({ id });

      // Sigue en segundo plano: la pantalla pregunta cada tanto cómo va.
      (async () => {
        try {
          const prev = actual?.estado === "LISTO" ? (actual.resultado?.oportunidades || []).map((o) => o.clave).filter(Boolean) : [];
          const ctx = await contextoDeLaEmpresa(db);
          const resultado = await ejecutarBusqueda({
            ai,
            modelo,
            ...ctx,
            anteriores: prev,
            progreso: (t) => db.query("UPDATE clientes_nuevos_busquedas SET progreso = ? WHERE id = ?", [t.slice(0, 190), id]).catch(() => {}),
          });
          await db.query("UPDATE clientes_nuevos_busquedas SET estado = 'LISTO', progreso = NULL, resultado = ?, terminado_at = NOW() WHERE id = ?", [JSON.stringify(resultado), id]);
        } catch (e) {
          console.error("[clientes-nuevos] búsqueda:", e.message);
          await db.query("UPDATE clientes_nuevos_busquedas SET estado = 'ERROR', progreso = NULL, error = ?, terminado_at = NOW() WHERE id = ?", [String(e.message || "Error").slice(0, 490), id]).catch(() => {});
        }
      })();
    } catch (e) {
      console.error("[clientes-nuevos] buscar:", e.message);
      if (!res.headersSent) res.status(500).json({ error: "No pude iniciar la búsqueda." });
    }
  });
}

module.exports = { SEGMENTOS, armarBusqueda, armarEstructura, extraerJSON, fuentesDe, ejecutarBusqueda, asegurarTablaClientesNuevos, ultimaBusqueda, registrarRutasClientesNuevos };
