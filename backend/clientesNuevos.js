"use strict";
// Clientes nuevos: con un botón, la IA sale a buscar en internet (Google Search) novedades que sean oportunidades de venta
// en toda la Argentina: licitaciones y compras públicas, obras viales y empresas del rubro. Devuelve un reporte ordenado.
// Solo usa información pública que encuentra; si no encuentra un contacto lo dice, no lo inventa.

const SEGMENTOS = [
  {
    id: "licitaciones",
    titulo: "Licitaciones y compras públicas",
    busqueda: () =>
      "Licitaciones, concursos de precios y compras públicas ABIERTAS o RECIENTES en Argentina (municipios, provincias, Vialidad Nacional y provincial, concesionarias viales, organismos de tránsito y seguridad vial) donde se compren productos como los nuestros: conos, topes, separadores de carril, delineadores, topes de estacionamiento, bandas reductoras de velocidad, señalización vial. Revisá portales de compras (COMPR.AR, portales provinciales y municipales, Boletín Oficial) y noticias.",
  },
  {
    id: "obras",
    titulo: "Obras viales y proyectos nuevos",
    busqueda: (ctx) =>
      "Obras viales, repavimentaciones, autopistas, rutas, ciclovías, playas de estacionamiento, parques industriales, aeropuertos y puertos ANUNCIADAS o EN EJECUCIÓN en Argentina, que van a necesitar señalización y seguridad vial temporal o permanente. Indicá quién es la empresa contratista o el organismo a cargo, para poder venderles." +
      (ctx.dormidos?.length ? ` Si en esas obras aparece alguna de estas empresas (clientes que dejaron de comprarnos), destacalo: ${ctx.dormidos.slice(0, 25).join(", ")}.` : ""),
  },
  {
    id: "empresas",
    titulo: "Empresas del rubro",
    busqueda: () =>
      "Empresas argentinas que podrían ser clientes o revendedores de productos de seguridad vial: constructoras viales, empresas de señalización, distribuidores y mayoristas de seguridad vial, corralones y ferreterías industriales grandes, concesionarias de peaje, empresas de logística y de estacionamiento. Priorizá las que aparezcan en noticias recientes, ampliaciones o contrataciones.",
  },
  {
    id: "parecidos",
    titulo: "Parecidas a tus mejores clientes",
    activo: (ctx) => (ctx.mejoresClientes || []).length > 0,
    busqueda: (ctx) =>
      `Empresas argentinas SIMILARES (mismo rubro, tamaño y tipo de compra) a estos clientes que ya nos compran bien: ${ctx.mejoresClientes.map((c) => `${c.cliente}${c.articulos?.length ? ` (compra ${c.articulos.slice(0, 3).join(", ")})` : ""}`).join("; ")}. Buscá empresas parecidas que no sean ellas, de cualquier provincia, que estén creciendo o contratando.`,
  },
];
const segmentosActivos = (ctx) => SEGMENTOS.filter((s) => !s.activo || s.activo(ctx));

const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function armarBusqueda(segmento, ctx = {}) {
  const { productos = [], clientes = [], excluir = [], fecha = hoyAR() } = ctx;
  return [
    `Hoy es ${fecha}. Trabajás para una fábrica argentina de productos plásticos de seguridad vial (inyección y rotomoldeo).`,
    productos.length ? `Lo que fabrica: ${productos.slice(0, 40).join(", ")}.` : "Fabrica bases de conos, topes, separadores de carril, topes de estacionamiento y puntas de cono.",
    `Tarea: encontrar NOVEDADES DEL MOMENTO (últimos 60 días, o abiertas hoy) en TODA la Argentina. ${segmento.busqueda(ctx)}`,
    "Para cada oportunidad escribí, en prosa corta: organización o empresa, provincia/ciudad, qué pasó o por qué es una oportunidad, fecha clave (cierre de la licitación, inicio de obra o fecha de la noticia, con día/mes/año si figura), monto o presupuesto si figura, y la web, mail o teléfono SOLO si aparece en las fuentes (copiá la dirección web completa si la viste).",
    "Separá cada oportunidad de la siguiente con una línea que contenga solamente =====",
    "Reglas: usá solo lo que encuentres en fuentes reales; no inventes empresas, fechas ni contactos; si un dato no figura escribí 'no figura'. Prefiero 6 a 10 oportunidades verificables antes que muchas dudosas.",
    clientes.length ? `No incluyas a estas empresas, que YA son clientes: ${clientes.slice(0, 120).join(", ")}.` : "",
    excluir.length ? `Tampoco incluyas estas, que ya fueron descartadas: ${excluir.slice(0, 80).join(", ")}.` : "",
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
          bloque: { type: "STRING", description: "El código entre corchetes del bloque de donde sale (ej: licitaciones-2)." },
          segmento: { type: "STRING", description: "licitaciones, obras, empresas o parecidos (el mismo del código del bloque)" },
          relacion: { type: "STRING", description: "'dormido' si la organización es una de las empresas clientes que dejaron de comprarnos; vacío si no." },
          titulo: { type: "STRING", description: "Una línea que diga qué es (ej: 'Licitación de conos y balizas para rutas provinciales')." },
          organizacion: { type: "STRING" },
          provincia: { type: "STRING", description: "Solo el nombre de la provincia (ej: Santa Fe, Buenos Aires, CABA). Vacío si no figura." },
          que_paso: { type: "STRING", description: "Por qué es una oportunidad, en 1 o 2 frases." },
          productos: { type: "ARRAY", items: { type: "STRING" }, description: "Productos de la fábrica a ofrecerle, uno por elemento y con nombre corto (ej: 'Cono 75 cm', 'Separador de carril'). Máximo 5." },
          argumento: { type: "STRING", description: "Una frase con el mejor argumento de venta para esta oportunidad." },
          siguiente_paso: { type: "STRING", description: "La próxima acción concreta, corta y con fecha si hay (ej: 'Pedir el pliego y cotizar antes del 12/11')." },
          mensaje: { type: "STRING", description: "Borrador de un primer mail corto (3 a 5 líneas) y cordial para presentarnos y ofrecer esos productos, firmado como 'Conoflex'. No inventes datos que no figuren." },
          fecha: { type: "STRING", description: "La fecha clave escrita en lenguaje natural (ej: 'Cierra el 12/11/2026'). Vacío si no figura." },
          fecha_iso: { type: "STRING", description: "La misma fecha en formato AAAA-MM-DD si es una fecha exacta; vacío si no." },
          fecha_tipo: { type: "STRING", description: "cierre, inicio o noticia" },
          monto: { type: "STRING", description: "Monto o presupuesto si figura (ej: '$85.000.000'); vacío si no." },
          contacto: { type: "STRING", description: "Mail, teléfono o web de contacto que figure; 'no figura' si no se encontró." },
          url_directa: { type: "STRING", description: "Una dirección web completa (http...) que aparezca TEXTUALMENTE en el bloque (portal, pliego o noticia). Vacío si no hay ninguna." },
          prioridad: { type: "INTEGER", description: "1 = ir ya, 2 = interesante, 3 = a futuro." },
          confianza: { type: "STRING", description: "alta, media o baja según cuán verificable es el dato." },
        },
        required: ["bloque", "segmento", "titulo", "organizacion", "que_paso", "prioridad"],
      },
    },
  },
  required: ["resumen", "oportunidades"],
};

function armarEstructura(bloques) {
  const cuerpo = bloques.map((b) => `[${b.id}]\n${b.texto}`).join("\n\n=====\n\n");
  return `Convertí estos bloques de resultados de búsqueda en datos estructurados (una oportunidad por bloque, indicando el código del bloque). Quedate SOLO con lo que está en el texto: no agregues ni inventes datos, contactos ni direcciones web. Sacá duplicados. Prioridad: 1 si hay una fecha cercana o una compra concreta, 2 si es una empresa o proyecto interesante, 3 si es a futuro o dudoso. Los productos a ofrecer elegilos de lo que fabrica la empresa. Si un dato no figura dejalo vacío o 'no figura'.\n\n${cuerpo}`;
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

/** Parte el texto de una búsqueda en oportunidades (separadas por =====) y guarda dónde empieza y termina cada una en bytes. */
function partirBloques(texto) {
  const t = String(texto || "");
  const re = /^[ \t]*={5,}[ \t]*$/gm;
  const salida = [];
  let ini = 0;
  const agregar = (a, b) => {
    const trozo = t.slice(a, b).trim();
    if (trozo.length > 40) salida.push({ texto: trozo, ini: Buffer.byteLength(t.slice(0, a)), fin: Buffer.byteLength(t.slice(0, b)) });
  };
  let m;
  while ((m = re.exec(t))) {
    agregar(ini, m.index);
    ini = m.index + m[0].length;
  }
  agregar(ini, t.length);
  return salida;
}

/** Las páginas que respaldan específicamente el texto de ese bloque (según lo que informa el buscador). */
function fuentesDeBloque(bloque, respuesta) {
  const meta = respuesta?.candidates?.[0]?.groundingMetadata || {};
  const chunks = meta.groundingChunks || [];
  const indices = new Set();
  for (const s of meta.groundingSupports || []) {
    const a = s?.segment?.startIndex ?? 0;
    if (a >= bloque.ini && a < bloque.fin) for (const i of s.groundingChunkIndices || []) indices.add(i);
  }
  const vistos = new Set();
  const salida = [];
  for (const i of indices) {
    const w = chunks[i]?.web;
    if (!w?.uri || vistos.has(w.uri)) continue;
    vistos.add(w.uri);
    salida.push({ titulo: String(w.title || w.uri).slice(0, 120), url: w.uri });
  }
  return salida;
}

/** Los enlaces del buscador son redirecciones: se siguen para mostrar la página real. Si algo falla queda el enlace original. */
async function resolverUrl(url, { fetchFn = globalThis.fetch, esperaMs = 4000 } = {}) {
  try {
    if (!/^https?:\/\//.test(url) || !/vertexaisearch|grounding-api-redirect/.test(url)) return { url, titulo: null };
    const r = await fetchFn(url, { redirect: "manual", signal: AbortSignal.timeout(esperaMs) });
    const destino = r.headers?.get?.("location");
    if (destino && /^https?:\/\//.test(destino)) return { url: destino, titulo: new URL(destino).hostname.replace(/^www\./, "") };
  } catch {
    /* queda el enlace original */
  }
  return { url, titulo: null };
}

const textoDe = (r) => {
  try {
    return typeof r?.text === "string" ? r.text : r?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  } catch {
    return "";
  }
};

const clave = (o) => sinAcentos(`${o.organizacion}|${o.titulo}`).replace(/[^a-z0-9|]+/g, " ").trim();

const esISO = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) && !Number.isNaN(Date.parse(f));
const lista = (v, max) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, max) : []);
const limpio = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * Corre la búsqueda completa. progreso(texto) avisa en qué paso va.
 * deps: { ai, modelo, productos, clientes, anteriores: [claves de la búsqueda previa], progreso, resolver }
 */
async function ejecutarBusqueda({ ai, modelo = "gemini-2.5-flash", productos = [], clientes = [], mejoresClientes = [], dormidos = [], excluir = [], anteriores = [], progreso = () => {}, fecha = hoyAR(), resolver = resolverUrl }) {
  progreso("Buscando en internet: licitaciones, obras y empresas…");
  const ctx = { productos, clientes, mejoresClientes, dormidos, excluir, fecha };
  const activos = segmentosActivos(ctx);
  const resultados = await Promise.allSettled(
    activos.map(async (s) => {
      const r = await ai.models.generateContent({
        model: modelo,
        contents: [{ role: "user", parts: [{ text: armarBusqueda(s, ctx) }] }],
        config: { tools: [{ googleSearch: {} }], temperature: 0.2, httpOptions: { timeout: 120000 } },
      });
      const texto = textoDe(r).trim();
      const bloques = partirBloques(texto).map((b, i) => ({ ...b, id: `${s.id}-${i + 1}`, segmento: s.id, fuentes: fuentesDeBloque(b, r) }));
      return { id: s.id, titulo: s.titulo, texto, bloques, fuentes: fuentesDe(r) };
    }),
  );
  const buenos = resultados.filter((r) => r.status === "fulfilled" && r.value.texto).map((r) => r.value);
  const fallidos = activos.filter((s, i) => resultados[i].status === "rejected" || !resultados[i].value?.texto).map((s) => s.titulo);
  if (!buenos.length) {
    const causa = resultados.find((r) => r.status === "rejected")?.reason?.message;
    throw new Error(`No se pudo buscar en internet${causa ? `: ${String(causa).slice(0, 160)}` : "."}`);
  }

  // Si un segmento no vino separado en oportunidades, se manda entero como un solo bloque.
  const bloques = buenos.flatMap((b) => (b.bloques.length ? b.bloques : [{ id: `${b.id}-1`, segmento: b.id, texto: b.texto, fuentes: [] }]));
  const porId = new Map(bloques.map((b) => [b.id, b]));
  const fuentesSegmento = new Map(buenos.map((b) => [b.id, b.fuentes]));

  progreso("Ordenando lo encontrado…");
  const est = await ai.models.generateContent({
    model: modelo,
    contents: [{ role: "user", parts: [{ text: armarEstructura(bloques) }] }],
    config: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0, httpOptions: { timeout: 90000 } },
  });
  const datos = extraerJSON(textoDe(est));
  if (!datos || !Array.isArray(datos.oportunidades)) throw new Error("La búsqueda terminó pero no pude ordenar los resultados. Probá de nuevo.");

  const previas = new Set(anteriores);
  const vistas = new Set();
  const armadas = [];
  let vencidas = 0;
  for (const o of datos.oportunidades) {
    const k = clave(o);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    const bloque = porId.get(String(o.bloque || "").trim());
    const segmento = ["licitaciones", "obras", "empresas", "parecidos"].includes(o.segmento) ? o.segmento : bloque?.segmento || "empresas";
    const fechaIso = esISO(o.fecha_iso) ? o.fecha_iso : "";
    // Una licitación que ya cerró no sirve: no se muestra.
    if (segmento === "licitaciones" && o.fecha_tipo === "cierre" && fechaIso && fechaIso < fecha) {
      vencidas++;
      continue;
    }
    let fuentes = bloque?.fuentes || [];
    const aproximada = fuentes.length === 0;
    if (aproximada) fuentes = (fuentesSegmento.get(segmento) || []).slice(0, 3);
    // La dirección directa solo vale si figura en el texto original (así no se inventa).
    const directa = limpio(o.url_directa, 400);
    const urlDirecta = /^https?:\/\/\S+$/.test(directa) && bloque?.texto?.includes(directa.replace(/[).,;]+$/, "")) ? directa.replace(/[).,;]+$/, "") : "";
    armadas.push({
      segmento,
      titulo: limpio(o.titulo, 200),
      organizacion: limpio(o.organizacion, 160),
      provincia: limpio(o.provincia, 60),
      que_paso: limpio(o.que_paso, 600),
      productos: lista(o.productos, 5),
      argumento: limpio(o.argumento, 300),
      siguiente_paso: limpio(o.siguiente_paso, 300),
      mensaje: limpio(o.mensaje, 1200),
      fecha: limpio(o.fecha, 120),
      fecha_iso: fechaIso,
      fecha_tipo: ["cierre", "inicio", "noticia"].includes(o.fecha_tipo) ? o.fecha_tipo : "",
      monto: limpio(o.monto, 80),
      relacion: o.relacion === "dormido" ? "dormido" : "",
      contacto: limpio(o.contacto, 300) || "no figura",
      url: urlDirecta,
      fuentes,
      fuentes_aproximadas: aproximada && fuentes.length > 0,
      prioridad: [1, 2, 3].includes(Number(o.prioridad)) ? Number(o.prioridad) : 2,
      confianza: ["alta", "media", "baja"].includes(o.confianza) ? o.confianza : "media",
      nueva: !previas.has(k),
      clave: k,
    });
  }

  // Los enlaces del buscador se siguen hasta la página real (en paralelo, de a poco).
  progreso("Comprobando los enlaces…");
  const unicas = [...new Set(armadas.flatMap((o) => o.fuentes.map((f) => f.url)))].slice(0, 60);
  const real = new Map();
  for (let i = 0; i < unicas.length; i += 8) {
    const tanda = await Promise.all(unicas.slice(i, i + 8).map((u) => resolver(u)));
    tanda.forEach((r, j) => real.set(unicas[i + j], r));
  }
  const conReal = (f) => {
    const r = real.get(f.url);
    return r ? { titulo: r.titulo || f.titulo, url: r.url } : f;
  };
  const oportunidades = armadas.map((o) => {
    const fuentes = o.fuentes.map(conReal);
    return { ...o, fuentes, url: o.url || fuentes[0]?.url || "" };
  });
  oportunidades.sort((a, b) => a.prioridad - b.prioridad || Number(b.nueva) - Number(a.nueva) || String(a.fecha_iso || "9").localeCompare(String(b.fecha_iso || "9")));

  return {
    resumen: limpio(datos.resumen, 600),
    oportunidades,
    fuentes: buenos.flatMap((b) => b.fuentes.map((f) => ({ ...conReal(f), segmento: b.id }))),
    segmentos_sin_resultado: fallidos,
    vencidas_descartadas: vencidas,
    fecha,
  };
}

// ---------- Competencia: quién gana las licitaciones y quiénes son los competidores ----------
const TEMAS_COMPETENCIA = [
  {
    id: "adjudicaciones",
    titulo: "Licitaciones adjudicadas",
    busqueda:
      "Licitaciones y compras públicas de conos, balizas, separadores de carril, delineadores, topes de estacionamiento y señalización vial que ya fueron ADJUDICADAS en Argentina en los últimos 12 meses. Por cada una: organismo, provincia, qué se compró, EMPRESA GANADORA, monto adjudicado, precio unitario si figura y fecha. Revisá COMPR.AR, portales provinciales y municipales, Boletín Oficial y noticias.",
  },
  {
    id: "fabricantes",
    titulo: "Fabricantes y proveedores",
    busqueda:
      "Fabricantes y proveedores argentinos de productos de seguridad vial (conos, separadores de carril, delineadores, topes, señalización) que compiten con una fábrica de plásticos por inyección y rotomoldeo. Por cada uno: empresa, provincia, productos que vende, página web y qué lo destaca.",
  },
];

const ESQUEMA_COMPETENCIA = {
  type: "OBJECT",
  properties: {
    resumen: { type: "STRING", description: "2 o 3 frases con lo más importante del panorama competitivo." },
    conclusiones: { type: "ARRAY", items: { type: "STRING" }, description: "3 a 5 conclusiones prácticas para competir (precios de referencia, quién domina, dónde hay lugar). Solo lo que surge del texto." },
    adjudicaciones: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          bloque: { type: "STRING", description: "Código entre corchetes del bloque de donde sale." },
          organismo: { type: "STRING" },
          provincia: { type: "STRING" },
          objeto: { type: "STRING", description: "Qué se compró." },
          ganador: { type: "STRING", description: "Empresa que ganó. Vacío si no figura." },
          monto: { type: "STRING" },
          precio_unitario: { type: "STRING", description: "Precio por unidad si figura (ej: '$12.500 por cono')." },
          fecha: { type: "STRING" },
          fecha_iso: { type: "STRING", description: "AAAA-MM-DD si es exacta; vacío si no." },
        },
        required: ["bloque", "organismo", "objeto"],
      },
    },
    competidores: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          bloque: { type: "STRING" },
          empresa: { type: "STRING" },
          provincia: { type: "STRING" },
          que_vende: { type: "STRING" },
          web: { type: "STRING", description: "Dirección web si figura en el texto." },
          fortaleza: { type: "STRING", description: "Qué lo destaca, en una frase." },
        },
        required: ["bloque", "empresa"],
      },
    },
  },
  required: ["resumen", "adjudicaciones", "competidores"],
};

const normEmpresa = (t) => sinAcentos(t).replace(/\b(s\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|sociedad anonima|ute|u\.t\.e\.?)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Cuántas licitaciones ganó cada empresa, con sus provincias y montos. */
function rankingGanadores(adjudicaciones) {
  const mapa = new Map();
  for (const a of adjudicaciones) {
    const k = normEmpresa(a.ganador);
    if (!k) continue;
    const e = mapa.get(k) || { empresa: a.ganador, victorias: 0, provincias: new Set(), ejemplos: [] };
    e.victorias++;
    if (a.provincia) e.provincias.add(a.provincia);
    e.ejemplos.push(a);
    mapa.set(k, e);
  }
  return [...mapa.values()]
    .map((e) => ({ empresa: e.empresa, victorias: e.victorias, provincias: [...e.provincias], ejemplos: e.ejemplos.slice(0, 4) }))
    .sort((a, b) => b.victorias - a.victorias || a.empresa.localeCompare(b.empresa, "es"));
}

async function ejecutarCompetencia({ ai, modelo = "gemini-2.5-flash", productos = [], progreso = () => {}, fecha = hoyAR(), resolver = resolverUrl }) {
  progreso("Buscando adjudicaciones y competidores…");
  const resultados = await Promise.allSettled(
    TEMAS_COMPETENCIA.map(async (t) => {
      const prompt = [
        `Hoy es ${fecha}. Trabajás para una fábrica argentina de productos plásticos de seguridad vial${productos.length ? ` (${productos.slice(0, 25).join(", ")})` : ""}.`,
        `Tarea: ${t.busqueda}`,
        "Escribí cada caso en prosa corta y separalo del siguiente con una línea que contenga solamente =====",
        "Reglas: usá solo lo que encuentres en fuentes reales; no inventes empresas, montos ni fechas; si un dato no figura escribí 'no figura'. Respondé en español, sin introducción.",
      ].join("\n\n");
      const r = await ai.models.generateContent({ model: modelo, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { tools: [{ googleSearch: {} }], temperature: 0.2, httpOptions: { timeout: 120000 } } });
      const texto = textoDe(r).trim();
      const bloques = partirBloques(texto).map((b, i) => ({ ...b, id: `${t.id}-${i + 1}`, fuentes: fuentesDeBloque(b, r) }));
      return { id: t.id, titulo: t.titulo, texto, bloques, fuentes: fuentesDe(r) };
    }),
  );
  const buenos = resultados.filter((r) => r.status === "fulfilled" && r.value.texto).map((r) => r.value);
  if (!buenos.length) {
    const causa = resultados.find((r) => r.status === "rejected")?.reason?.message;
    throw new Error(`No se pudo buscar en internet${causa ? `: ${String(causa).slice(0, 160)}` : "."}`);
  }
  const bloques = buenos.flatMap((b) => (b.bloques.length ? b.bloques : [{ id: `${b.id}-1`, texto: b.texto, fuentes: [] }]));
  const porId = new Map(bloques.map((b) => [b.id, b]));
  const fuentesTema = new Map(buenos.map((b) => [b.id, b.fuentes]));

  progreso("Ordenando lo encontrado…");
  const est = await ai.models.generateContent({
    model: modelo,
    contents: [{ role: "user", parts: [{ text: `Convertí estos bloques de resultados en datos estructurados. Quedate SOLO con lo que está en el texto: no inventes empresas, montos ni direcciones. Indicá el código del bloque de cada dato. Las conclusiones tienen que salir de los datos (por ejemplo, precios de referencia, quién gana más, en qué provincias hay poca competencia).\n\n${bloques.map((b) => `[${b.id}]\n${b.texto}`).join("\n\n=====\n\n")}` }] }],
    config: { responseMimeType: "application/json", responseSchema: ESQUEMA_COMPETENCIA, temperature: 0, httpOptions: { timeout: 90000 } },
  });
  const datos = extraerJSON(textoDe(est));
  if (!datos || !Array.isArray(datos.adjudicaciones) || !Array.isArray(datos.competidores)) throw new Error("La búsqueda terminó pero no pude ordenar los resultados. Probá de nuevo.");

  const fuentesDelBloque = (id) => {
    const b = porId.get(String(id || "").trim());
    if (b?.fuentes?.length) return { fuentes: b.fuentes, aproximadas: false };
    const tema = String(id || "").split("-")[0];
    return { fuentes: (fuentesTema.get(tema) || []).slice(0, 3), aproximadas: true };
  };
  const adjudicaciones = datos.adjudicaciones.filter((a) => limpio(a.objeto, 5)).map((a) => ({
    organismo: limpio(a.organismo, 160), provincia: limpio(a.provincia, 60), objeto: limpio(a.objeto, 300), ganador: limpio(a.ganador, 160), monto: limpio(a.monto, 80),
    precio_unitario: limpio(a.precio_unitario, 100), fecha: limpio(a.fecha, 80), fecha_iso: esISO(a.fecha_iso) ? a.fecha_iso : "", ...(({ fuentes, aproximadas }) => ({ fuentes, fuentes_aproximadas: aproximadas && fuentes.length > 0 }))(fuentesDelBloque(a.bloque)),
  }));
  const competidores = datos.competidores.filter((c) => limpio(c.empresa, 2)).map((c) => ({
    empresa: limpio(c.empresa, 160), provincia: limpio(c.provincia, 60), que_vende: limpio(c.que_vende, 300), web: /^https?:\/\/\S+$/.test(limpio(c.web, 300)) && porId.get(String(c.bloque || "").trim())?.texto?.includes(limpio(c.web, 300)) ? limpio(c.web, 300) : "", fortaleza: limpio(c.fortaleza, 300), ...(({ fuentes, aproximadas }) => ({ fuentes, fuentes_aproximadas: aproximadas && fuentes.length > 0 }))(fuentesDelBloque(c.bloque)),
  }));

  progreso("Comprobando los enlaces…");
  const unicas = [...new Set([...adjudicaciones, ...competidores].flatMap((o) => o.fuentes.map((f) => f.url)))].slice(0, 60);
  const real = new Map();
  for (let i = 0; i < unicas.length; i += 8) {
    const tanda = await Promise.all(unicas.slice(i, i + 8).map((u) => resolver(u)));
    tanda.forEach((r, j) => real.set(unicas[i + j], r));
  }
  const conReal = (f) => {
    const r = real.get(f.url);
    return r ? { titulo: r.titulo || f.titulo, url: r.url } : f;
  };
  const adj = adjudicaciones.map((a) => ({ ...a, fuentes: a.fuentes.map(conReal) }));
  const comp = competidores.map((c) => ({ ...c, fuentes: c.fuentes.map(conReal) }));
  return { resumen: limpio(datos.resumen, 600), conclusiones: lista(datos.conclusiones, 6), ranking: rankingGanadores(adj), adjudicaciones: adj, competidores: comp, fecha };
}

/** Revisa en internet si una licitación seguida tuvo novedades (prórroga, circular, adjudicación...). Devuelve el texto o null. */
async function revisarLicitacion({ ai, modelo = "gemini-2.5-flash", oportunidad, fecha = hoyAR() }) {
  const o = oportunidad;
  const prompt = `Hoy es ${fecha}. Revisá el estado ACTUAL de esta licitación u oportunidad de compra en Argentina: "${o.titulo}" de ${o.organizacion}${o.provincia ? ` (${o.provincia})` : ""}${o.fecha ? `. Fecha conocida: ${o.fecha}` : ""}. ¿Hubo prórroga de la fecha, cambios en el pliego, circulares, adjudicación, cancelación u otra novedad? Respondé en máximo 2 frases con lo que encuentres en fuentes reales. Si no encontrás novedades confirmadas respondé exactamente: SIN NOVEDADES.`;
  const r = await ai.models.generateContent({ model: modelo, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { tools: [{ googleSearch: {} }], temperature: 0.1, httpOptions: { timeout: 60000 } } });
  const t = textoDe(r).trim();
  if (!t || /^sin novedades/i.test(t)) return null;
  return t.slice(0, 500);
}

module.exports = { SEGMENTOS, armarBusqueda, armarEstructura, extraerJSON, fuentesDe, partirBloques, fuentesDeBloque, resolverUrl, ejecutarBusqueda, ejecutarCompetencia, rankingGanadores, revisarLicitacion, normEmpresa, clave, hoyAR, sinAcentos };
