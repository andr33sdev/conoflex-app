"use strict";
// Costos de materias primas desde la planilla de Google Sheets (solo administradores).
//
// Regla de la planilla: donde sea que aparezca un código de materia prima de la app (en cualquier celda
// de la hoja), su costo en dólares está 4 columnas a la derecha (ej.: código en A → costo en E;
// código en H → costo en L). Antes de guardar se muestra qué cambia; el link queda guardado.

const { guardarCosto } = require("./mpCostos");

const CLAVE_URL = "costos_sheets_url";
const SALTO = 4;

const clave = (v) => String(v ?? "").replace(/ /g, " ").trim().toUpperCase().replace(/\s+/g, " ");

/** Link de Google Sheets (normal o publicado) → link de descarga en CSV de esa hoja. null si no es de Sheets. */
function urlCsv(url) {
  let u;
  try {
    u = new URL(String(url || "").trim());
  } catch {
    return null;
  }
  if (u.hostname !== "docs.google.com" || !u.pathname.startsWith("/spreadsheets/")) return null;
  // Publicada en la web: /spreadsheets/d/e/<id>/pub?...  → output=csv
  if (/\/spreadsheets\/d\/e\//.test(u.pathname)) {
    const base = u.pathname.replace(/\/pubhtml$/, "/pub");
    const gid = u.searchParams.get("gid") || (u.hash.match(/gid=(\d+)/) || [])[1];
    return `https://docs.google.com${base}?output=csv${gid ? `&gid=${gid}` : ""}${u.searchParams.get("single") ? "&single=true" : ""}`;
  }
  const id = (u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
  if (!id) return null;
  // Sin hoja indicada (link de "Copiar enlace"), Google entrega la primera hoja. No se asume gid=0: si esa hoja
  // no existe, Google responde 400.
  const gid = u.searchParams.get("gid") || (u.hash.match(/gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

/** CSV → filas (respeta comillas, comas y saltos de línea dentro de celdas). */
function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let celda = "";
  let comillas = false;
  const t = String(texto || "").replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ",") {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** "$1.575,00" → 1575 · "$0,50" → 0.5 · "2.6" → 2.6 · "" o texto → null. */
function numero(v) {
  let s = String(v ?? "").replace(/ /g, " ").replace(/US\$|U\$S|USD|\$/gi, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6) / 1e6 : null;
}

const letra = (c) => {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/**
 * Busca cada código de la app en toda la hoja y toma el valor 4 columnas a la derecha.
 *  codigos: Set de códigos de la app (ya normalizados con clave()).
 * Devuelve { costos: Map(codigo → {costo, celda}), sin_valor: [{codigo, celda}], conflictos: [{codigo, valores:[{costo, celda}]}] }
 */
function costosDeHoja(filas, codigos) {
  const hallados = new Map();
  for (let r = 0; r < filas.length; r++) {
    for (let c = 0; c < filas[r].length; c++) {
      const k = clave(filas[r][c]);
      if (!k || !codigos.has(k)) continue;
      const celda = `${letra(c + SALTO)}${r + 1}`;
      if (!hallados.has(k)) hallados.set(k, []);
      hallados.get(k).push({ costo: numero(filas[r][c + SALTO]), celda });
    }
  }
  const costos = new Map();
  const sinValor = [];
  const conflictos = [];
  for (const [codigo, lista] of hallados) {
    const conValor = lista.filter((x) => x.costo != null);
    if (!conValor.length) {
      sinValor.push({ codigo, celda: lista[0].celda });
      continue;
    }
    costos.set(codigo, conValor[0]); // si aparece más de una vez, vale la primera (de arriba a abajo)
    if (new Set(conValor.map((x) => x.costo)).size > 1) conflictos.push({ codigo, valores: conValor });
  }
  return { costos, sin_valor: sinValor, conflictos };
}

/** Compara con lo cargado en la app: qué costos cambian. */
function plan(materias, hoja) {
  const cambios = [];
  let iguales = 0;
  for (const m of materias) {
    const h = hoja.costos.get(clave(m.codigo));
    if (!h) continue;
    const antes = m.costo == null ? null : Number(m.costo);
    if (antes != null && Math.abs(antes - h.costo) < 1e-9) iguales++;
    else cambios.push({ id: m.id, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad_medida, antes, despues: h.costo, celda: h.celda });
  }
  const sinEnPlanilla = materias.filter((m) => !hoja.costos.has(clave(m.codigo)) && m.costo == null).length;
  return { cambios, iguales, sin_valor: hoja.sin_valor, conflictos: hoja.conflictos, sin_costo_y_no_estan: sinEnPlanilla };
}

// ---------------------------------------------------------------- base de datos y rutas

async function leerUrl(db) {
  const [[r]] = await db.query("SELECT valor FROM reglas WHERE clave = ?", [CLAVE_URL]);
  return r?.valor || "";
}

async function descargar(url, fetcher = fetch) {
  const csv = urlCsv(url);
  if (!csv) throw Object.assign(new Error("Ese link no es de una planilla de Google Sheets."), { status: 400 });
  // Google contesta distinto según quién pide: se pide como lo haría curl/un navegador, no como "node".
  let res;
  try {
    res = await fetcher(csv, { redirect: "follow", headers: { "User-Agent": "curl/8.5.0", Accept: "text/csv,*/*" } });
  } catch (e) {
    throw Object.assign(new Error(`No pude conectarme con Google (${e.cause?.code || e.message}).`), { status: 502 });
  }
  const tipo = String(res.headers?.get?.("content-type") || "");
  if (!res.ok || tipo.includes("text/html")) {
    console.warn(`[costos sheets] Google respondió ${res.status} ${tipo} para ${csv}`);
    const permiso = res.status === 401 || res.status === 403 || (res.ok && tipo.includes("text/html"));
    const msg = permiso
      ? "No pude abrir la planilla. En Sheets: Compartir → Acceso general → «Cualquier persona con el enlace» como Lector, y volvé a probar."
      : res.status === 404 || res.status === 400
        ? "Google no encuentra esa planilla u hoja. Abrí la hoja de costos y copiá el link desde la barra del navegador (no con «Copiar enlace»)."
        : "Google no entregó la planilla.";
    throw Object.assign(new Error(`${msg} (Google respondió ${res.status}${tipo ? `, ${tipo.split(";")[0]}` : ""})`), { status: 400 });
  }
  return leerCsv(await res.text());
}

async function previsualizar(db, url, fetcher) {
  const filas = await descargar(url, fetcher);
  const [materias] = await db.query("SELECT m.id, m.codigo, m.nombre, m.unidad_medida, c.costo FROM materias_primas m LEFT JOIN mp_costos c ON c.materia_prima_id = m.id");
  return plan(materias, costosDeHoja(filas, new Set(materias.map((m) => clave(m.codigo)))));
}

function registrarRutasCostosSheets(app, { db, requireAdmin, fetcher }) {
  const err = (res, e) => {
    if (!e.status) console.error("[costos sheets]", e);
    res.status(e.status || 500).json({ error: e.message });
  };
  const usuarioDe = (req) => req.user?.nombre || req.user?.email || (req.user?.id ? `usuario ${req.user.id}` : null);

  app.get("/api/costos/sheets", requireAdmin, async (req, res) => {
    try {
      res.json({ url: await leerUrl(db) });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/costos/sheets/previsualizar", requireAdmin, async (req, res) => {
    try {
      const url = String(req.body?.url || "").trim() || (await leerUrl(db));
      if (!url) return res.status(400).json({ error: "Pegá el link de la planilla de costos." });
      const p = await previsualizar(db, url, fetcher);
      await db.query("INSERT INTO reglas (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [CLAVE_URL, url]);
      res.json({ url, ...p });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/costos/sheets/aplicar", requireAdmin, async (req, res) => {
    try {
      const url = String(req.body?.url || "").trim() || (await leerUrl(db));
      if (!url) return res.status(400).json({ error: "Pegá el link de la planilla de costos." });
      const p = await previsualizar(db, url, fetcher);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        for (const c of p.cambios) {
          await guardarCosto(conn, { id: c.id, costo: c.despues, usuario: usuarioDe(req), origen: "PLANILLA", detalle: `celda ${c.celda}` });
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      res.json({ actualizados: p.cambios.length, iguales: p.iguales });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = { urlCsv, leerCsv, numero, letra, costosDeHoja, plan, previsualizar, registrarRutasCostosSheets };
