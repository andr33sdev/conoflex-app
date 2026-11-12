"use strict";
// Lector de facturas: corre en la PC del trabajo (la que llega por VPN al servidor del sistema de facturación).
// Cada CADA_MINUTOS revisa las carpetas de facturas, lee los PDF nuevos y los sube a la app.
// Cada archivo se lee una sola vez (queda anotado en procesados.json). Arranque:  pm2 start index.js --name lector-facturas
const fs = require("fs");
const path = require("path");
const { leerComprobante, palabrasDelPdf } = require("./parser");

// ---- configuración (.env al lado de este archivo)
function cargarEnv() {
  const archivo = path.join(__dirname, ".env");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
cargarEnv();
const CARPETAS = String(process.env.CARPETAS || "").split(";").map((c) => c.trim()).filter(Boolean);
const APP_URL = String(process.env.APP_URL || "https://conoflex-app.vercel.app").replace(/\/+$/, "");
const TOKEN = process.env.FACTURAS_TOKEN || "";
const DESDE = new Date(`${process.env.DESDE || "2025-01-01"}T00:00:00`);
const CADA_MINUTOS = Math.max(1, Number(process.env.CADA_MINUTOS) || 5);
const LOTE = 25;
const MAX_INTENTOS = 3;
const ESTADO = path.join(__dirname, "procesados.json");
// Versión del lector. 2: lee el importe de las facturas y notas de crédito B (06, 07, 08, 206, 208).
const VERSION = 2;
const ES_B = /^(0?6|0?7|0?8|206|208)\s/;

const log = (...a) => console.log(new Date().toLocaleString("es-AR"), ...a);

let estado = {};
try {
  estado = JSON.parse(fs.readFileSync(ESTADO, "utf8"));
} catch {
  estado = {};
}
const guardarEstado = () => fs.writeFileSync(ESTADO, JSON.stringify(estado));

async function subir(comprobantes) {
  const r = await fetch(`${APP_URL}/api/public/facturas/lote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-facturas-token": TOKEN },
    body: JSON.stringify({ comprobantes }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo.error || `la app respondió ${r.status}`);
  return cuerpo;
}

let corriendo = false;
async function vuelta() {
  if (corriendo) return;
  corriendo = true;
  try {
    // 1) Qué archivos hay sin leer (los más nuevos primero).
    const pendientes = [];
    for (const carpeta of CARPETAS) {
      let nombres;
      try {
        nombres = await fs.promises.readdir(carpeta);
      } catch (e) {
        log(`⚠ No pude abrir ${carpeta} (¿VPN conectada?): ${e.code || e.message}`);
        continue;
      }
      for (const nombre of nombres) {
        if (!/\.pdf$/i.test(nombre)) continue;
        const clave = `${path.basename(carpeta)}/${nombre}`;
        const e = estado[clave];
        // Las facturas/NC B leídas antes de la versión 2 quedaron sin importe: se vuelven a leer una vez.
        const releer = e?.ok && (e.v || 1) < VERSION && ES_B.test(nombre);
        if (e && !releer && (e.ok || e.viejo || (e.intentos || 0) >= MAX_INTENTOS)) continue;
        const ruta = path.join(carpeta, nombre);
        let st;
        try {
          st = await fs.promises.stat(ruta);
        } catch {
          continue;
        }
        if (st.mtime < DESDE) {
          estado[clave] = { viejo: true };
          continue;
        }
        pendientes.push({ clave, ruta, nombre, carpeta: path.basename(carpeta), mtime: st.mtime.getTime() });
      }
    }
    guardarEstado();
    if (!pendientes.length) return;
    pendientes.sort((a, b) => b.mtime - a.mtime);
    log(`${pendientes.length} comprobantes para leer`);

    // 2) Leer y subir de a lotes.
    let lote = [];
    let subidos = 0;
    const enviar = async () => {
      if (!lote.length) return;
      const actual = lote;
      lote = [];
      try {
        await subir(actual.map((x) => x.datos));
        for (const x of actual) estado[x.clave] = { ok: true, v: VERSION };
        subidos += actual.length;
        if (subidos % 500 < actual.length) log(`… ${subidos} de ${pendientes.length} subidos`);
      } catch (e) {
        log(`⚠ No se pudieron subir ${actual.length}: ${e.message}`);
        for (const x of actual) estado[x.clave] = { intentos: (estado[x.clave]?.intentos || 0) + 1, error: e.message };
      }
      guardarEstado();
    };
    for (const p of pendientes) {
      try {
        const datos = leerComprobante(await palabrasDelPdf(await fs.promises.readFile(p.ruta)), p.nombre);
        if (datos.error) throw new Error(datos.error);
        lote.push({ clave: p.clave, datos: { ...datos, carpeta: p.carpeta, archivo: p.nombre } });
      } catch (e) {
        estado[p.clave] = { intentos: (estado[p.clave]?.intentos || 0) + 1, error: e.message };
        log(`⚠ ${p.nombre}: ${e.message}`);
      }
      if (lote.length >= LOTE) await enviar();
    }
    await enviar();
    log(`Listo: ${subidos} comprobantes subidos a la app`);
  } catch (e) {
    log("⚠ Error en la vuelta:", e.message);
  } finally {
    corriendo = false;
  }
}

if (!TOKEN || !CARPETAS.length) {
  console.error("Falta configurar el .env (CARPETAS y FACTURAS_TOKEN). Mirá el README.");
  process.exit(1);
}
log(`Lector de facturas: ${CARPETAS.length} carpetas, cada ${CADA_MINUTOS} min, desde ${DESDE.toLocaleDateString("es-AR")}`);
vuelta();
setInterval(vuelta, CADA_MINUTOS * 60 * 1000);
