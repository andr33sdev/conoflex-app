"use strict";
// Carga mensual de la lista de precios.
// REGLA: la lista SOLO cambia el precio de lista. Nunca toca descripción, usos, advertencias, categoría, fotos ni el nombre y las medidas
// de un producto que ya existe. Funciona en dos pasos: primero se ANALIZA (no cambia nada) y recién después se APLICA lo que la persona confirmó.
const { normalizarCodigo, mismoProducto, leerPrecios } = require("./catalogo");

const UMBRAL_SUBA = 60; // % de suba que obliga a mirar el cambio antes de aplicarlo
const UMBRAL_BAJA = -25;
const VIGENCIA_ANALISIS_MS = 6 * 3600 * 1000;

// ---------- formato ----------
const fmt = (n) => {
  const [ent, dec] = Number(n).toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};
const pesos = (n) => `$${fmt(n)}`;

/** [{etiqueta, valor}] → el mismo texto libre que ya guarda el sistema ("$35.210,07" o "SIN FIJACIÓN $34.303,34 | HORMIGÓN $55.430,57"). */
function textoPrecio(precios, nota = "") {
  const validos = (precios || []).filter((p) => Number.isFinite(Number(p.valor)) && Number(p.valor) > 0);
  if (!validos.length) return "";
  const partes = validos.map((p) => `${String(p.etiqueta || "").trim().toUpperCase()}${p.etiqueta ? " " : ""}${pesos(p.valor)}`);
  const n = String(nota || "").trim();
  return partes.join(" | ") + (n ? ` ${n}` : "");
}

// ---------- lectura de lo que devolvió la IA / el Excel ----------
const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  // "35.210,07" (argentino) o "35210.07"
  return /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
};

/** Texto → objetos JSON aunque venga con ``` o cortado a la mitad (se rescatan los productos completos). */
function parsearJsonProductos(texto) {
  let t = String(texto || "").replace(/```json|```/g, "").trim();
  const arr = (j) => (Array.isArray(j) ? j : Array.isArray(j?.productos) ? j.productos : null);
  try {
    const r = arr(JSON.parse(t));
    if (r) return r;
  } catch {
    /* se intenta rescatar */
  }
  const ini = t.indexOf("[");
  if (ini < 0) return [];
  t = t.slice(ini);
  const out = [];
  let prof = 0;
  let desde = -1;
  let enTexto = false;
  let esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enTexto) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') enTexto = true;
    else if (c === "{") {
      if (prof === 0) desde = i;
      prof++;
    } else if (c === "}") {
      prof--;
      if (prof === 0 && desde >= 0) {
        try {
          out.push(JSON.parse(t.slice(desde, i + 1)));
        } catch {
          /* objeto roto: se descarta */
        }
        desde = -1;
      }
    }
  }
  return out;
}

/** Normaliza los productos leídos: código, nombre, medidas y precios [{etiqueta, valor}]. Descarta lo que no tenga código y precio. */
function normalizarExtraidos(lista) {
  const out = [];
  const descartados = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    const codigo = String(x?.codigo ?? x?.cod ?? "").replace(/\s+/g, " ").trim();
    const nombre = String(x?.nombre ?? "").replace(/\s+/g, " ").trim();
    let precios = [];
    if (Array.isArray(x?.precios)) precios = x.precios.map((p) => ({ etiqueta: String(p?.etiqueta ?? "").trim(), valor: num(p?.valor ?? p?.precio) }));
    else if (x?.precio !== undefined && x?.precio !== null && x?.precio !== "") precios = [{ etiqueta: "", valor: num(x.precio) }];
    precios = precios.filter((p) => Number.isFinite(p.valor) && p.valor > 0);
    if (!codigo || codigo === "-" || /^(none|nan|null)$/i.test(codigo) || codigo.length > 40) {
      if (nombre || precios.length) descartados.push(nombre || codigo || "(sin nombre)");
      continue;
    }
    if (!precios.length) {
      descartados.push(`${codigo} (sin precio en la lista)`);
      continue;
    }
    out.push({ codigo, nombre, medidas: String(x?.medidas ?? "").replace(/\s+/g, " ").trim(), precios, nota: String(x?.nota ?? x?.unidad ?? "").trim().slice(0, 40), texto: textoPrecio(precios, x?.nota ?? x?.unidad) });
  }
  return { productos: out, descartados };
}

/** El texto con "Cód:/Nombre:/Medidas:/Precio Lista:" que arma la lectura de Excel → productos. */
function parsearTextoCatalogo(texto) {
  const out = [];
  for (const bloque of String(texto || "").split(/-{20,}|-{30,}/)) {
    const g = (re) => (bloque.match(re)?.[1] || "").trim();
    const codigo = g(/^\s*C[oó]d(?:igo)?:\s*(.+)$/im);
    const precio = g(/^\s*Precio Lista:\s*(.+)$/im);
    if (!codigo) continue;
    const t = leerPrecios(precio);
    out.push({ codigo, nombre: g(/^\s*Nombre:\s*(.+)$/im), medidas: g(/^\s*Medidas:\s*(.+)$/im), precios: t.valores.map((v) => ({ etiqueta: v.etiqueta, valor: v.valor })), nota: t.unidad ? `x ${t.unidad}` : "" });
  }
  return out;
}

// ---------- comparación ----------
function claveNombre(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/**
 * Cruza lo que trae la lista con los productos de la base. Solo mira códigos:
 *  - exacto: mismo código normalizado → se puede aplicar tranquilo;
 *  - probable: el código de la base es el de la lista más un sufijo (o al revés) → se muestra aparte y NO viene tildado;
 *  - sin match: producto nuevo (la persona decide si lo crea).
 */
function compararLista({ extraidos, productos }) {
  const porCodigo = new Map();
  for (const p of productos) for (const a of String(p.codigo || "").split(/\s*[\/;,|]\s*/).map(normalizarCodigo).filter(Boolean)) porCodigo.set(a, [...(porCodigo.get(a) || []), p]);
  const usados = new Set();
  const vistosLista = new Map();
  const cambios = [];
  const nuevos = [];
  const duplicados = [];
  let sinCambios = 0;

  for (const x of extraidos) {
    const cod = normalizarCodigo(x.codigo);
    if (vistosLista.has(cod)) {
      duplicados.push(x.codigo);
      continue;
    }
    vistosLista.set(cod, x);
    let match = "exacto";
    let candidatos = (porCodigo.get(cod) || []).filter((p) => !usados.has(p.id));
    if (!candidatos.length) {
      match = "probable";
      candidatos = productos.filter((p) => !usados.has(p.id) && (mismoProducto(x.codigo, p.codigo) || mismoProducto(p.codigo, x.codigo)));
    }
    if (candidatos.length !== 1) {
      nuevos.push({ codigo: x.codigo, nombre: x.nombre, medidas: x.medidas, precio: x.texto, ...(candidatos.length > 1 ? { aviso: `Coincide con ${candidatos.length} productos (${candidatos.map((c) => c.codigo).join(", ")}): no se aplica solo.` } : {}) });
      continue;
    }
    const p = candidatos[0];
    usados.add(p.id);
    const antes = leerPrecios(p.precio_lista);
    const ahora = { valores: x.precios, unico: x.precios.length === 1 ? x.precios[0].valor : null };
    const igual = antes.valores.length === ahora.valores.length && antes.valores.every((v, i) => Math.abs(v.valor - ahora.valores[i].valor) < 0.005);
    if (igual && match === "exacto") {
      sinCambios++;
      continue;
    }
    let variacion = null;
    if (antes.unico !== null && ahora.unico !== null) variacion = Math.round((ahora.unico / antes.unico - 1) * 1000) / 10;
    const avisos = [];
    if (match === "probable") avisos.push(`El código de la lista es "${x.codigo}" y el del producto "${p.codigo}": confirmá que es el mismo.`);
    if (variacion !== null && (variacion > UMBRAL_SUBA || variacion < UMBRAL_BAJA)) avisos.push(`Cambio muy grande (${variacion > 0 ? "+" : ""}${String(variacion).replace(".", ",")}%): revisalo antes de aplicar.`);
    if (!antes.valores.length) avisos.push("Antes no tenía precio.");
    else if (antes.valores.length !== ahora.valores.length) avisos.push(`Antes tenía ${antes.valores.length} ${antes.valores.length === 1 ? "precio" : "precios"} y ahora ${ahora.valores.length}.`);
    cambios.push({
      id: p.id, codigo: p.codigo, nombre: p.nombre, codigo_lista: x.codigo, match,
      anterior: p.precio_lista || "", nuevo: x.texto, variacion, sin_precio_antes: !antes.valores.length,
      revisar: avisos.some((a) => /muy grande|código de la lista/.test(a)), avisos,
    });
  }
  const ausentes = productos.filter((p) => !usados.has(p.id)).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio_lista: p.precio_lista || "" }));
  const avisos = [];
  const coincidieron = usados.size;
  if (productos.length >= 10 && coincidieron < productos.length * 0.5) avisos.push(`Solo ${coincidieron} de los ${productos.length} productos del sistema aparecen en esta lista. Si no era una lista parcial, puede que el archivo sea de otro formato o la lectura esté incompleta.`);
  if (extraidos.length && !coincidieron && productos.length) avisos.push("Ningún código de la lista coincide con los productos del sistema.");
  return { cambios, nuevos, ausentes, sinCambios, duplicados, avisos, coincidieron };
}

/** ¿Qué cambios vienen tildados de entrada? Los exactos y sin avisos de revisión. */
const tildadoPorDefecto = (c) => c.match === "exacto" && !c.revisar;

// ---------- base de datos ----------
async function asegurarTablasPrecios(db) {
  const [cols] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productos'");
  const hay = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!hay.has("precio_anterior")) await db.query("ALTER TABLE productos ADD COLUMN precio_anterior VARCHAR(255) NULL");
  if (!hay.has("precio_actualizado")) await db.query("ALTER TABLE productos ADD COLUMN precio_actualizado DATETIME NULL");
  await db.query(`CREATE TABLE IF NOT EXISTS precios_cargas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    archivo VARCHAR(255) NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'ANALIZADA',
    usuario VARCHAR(120) NULL,
    detalle MEDIUMTEXT NULL,
    actualizados INT NOT NULL DEFAULT 0,
    nuevos INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    aplicada_en DATETIME NULL,
    deshecha_en DATETIME NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS precios_historial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,
    carga_id INT NULL,
    precio_anterior VARCHAR(255) NULL,
    precio_nuevo VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_producto (producto_id, id),
    KEY idx_carga (carga_id)
  )`);
  // Copia completa de los productos que la persona decidió quitar, para poder deshacer.
  await db.query(`CREATE TABLE IF NOT EXISTS precios_quitados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    carga_id INT NOT NULL,
    producto_id INT NOT NULL,
    datos MEDIUMTEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_carga (carga_id)
  )`);
}

async function guardarAnalisis(db, { archivo, usuario, analisis }) {
  const [r] = await db.query("INSERT INTO precios_cargas (archivo, usuario, detalle) VALUES (?,?,?)", [String(archivo || "").slice(0, 255), usuario || null, JSON.stringify(analisis)]);
  return r.insertId;
}

/**
 * Aplica la carga confirmada. SOLO escribe precio_lista (guardando el anterior) y crea los productos nuevos elegidos.
 * `ids`: productos a actualizar; `nuevos`: códigos a crear. Lo que no se pida, no se toca.
 */
async function aplicarCarga(db, { cargaId, ids = [], nuevos = [], quitar = [], usuario, ahora = Date.now() }) {
  const [[carga]] = await db.query("SELECT id, estado, detalle, UNIX_TIMESTAMP(created_at) * 1000 AS creada FROM precios_cargas WHERE id = ?", [cargaId]);
  if (!carga) return { error: "No encontré esa carga. Volvé a subir la lista.", status: 404 };
  if (carga.estado !== "ANALIZADA") return { error: carga.estado === "APLICADA" ? "Esa carga ya se aplicó." : "Esa carga ya no se puede aplicar. Volvé a subir la lista.", status: 409 };
  if (ahora - Number(carga.creada) > VIGENCIA_ANALISIS_MS) return { error: "El análisis tiene más de 6 horas: volvé a subir la lista para trabajar con los precios de hoy.", status: 409 };
  let analisis;
  try {
    analisis = JSON.parse(carga.detalle);
  } catch {
    return { error: "El análisis está dañado. Volvé a subir la lista.", status: 500 };
  }
  const quieren = new Set(ids.map(Number));
  const quierenNuevos = new Set(nuevos.map((c) => normalizarCodigo(c)));
  const quierenQuitar = new Set(quitar.map(Number));
  const conn = await db.getConnection();
  let actualizados = 0;
  let creados = 0;
  let quitados = 0;
  const saltados = [];
  try {
    await conn.beginTransaction();
    for (const c of analisis.cambios) {
      if (!quieren.has(Number(c.id))) continue;
      const [[p]] = await conn.query("SELECT id, precio_lista FROM productos WHERE id = ? FOR UPDATE", [c.id]);
      if (!p) {
        saltados.push(`${c.codigo}: ya no existe`);
        continue;
      }
      // Solo precio: el resto de la ficha no aparece en esta consulta.
      await conn.query("UPDATE productos SET precio_anterior = precio_lista, precio_lista = ?, precio_actualizado = NOW(), updated_at = NOW() WHERE id = ?", [c.nuevo, c.id]);
      await conn.query("INSERT INTO precios_historial (producto_id, carga_id, precio_anterior, precio_nuevo) VALUES (?,?,?,?)", [c.id, cargaId, p.precio_lista || null, c.nuevo]);
      actualizados++;
    }
    for (const n of analisis.nuevos) {
      if (n.aviso || !quierenNuevos.has(normalizarCodigo(n.codigo))) continue;
      const [[ya]] = await conn.query("SELECT id FROM productos WHERE codigo = ?", [n.codigo]);
      if (ya) {
        saltados.push(`${n.codigo}: ya existe`);
        continue;
      }
      const [r] = await conn.query(
        "INSERT INTO productos (codigo, nombre, medidas, precio_lista, especificacion, aplicacion, categoria, precio_actualizado) VALUES (?,?,?,?,?,?,?,NOW())",
        [n.codigo, n.nombre || "", n.medidas || "", n.precio, "", "", "General"],
      );
      await conn.query("INSERT INTO precios_historial (producto_id, carga_id, precio_anterior, precio_nuevo) VALUES (?,?,NULL,?)", [r.insertId, cargaId, n.precio]);
      creados++;
    }
    // Solo se quitan productos que el análisis marcó como ausentes Y que la persona eligió uno por uno.
    for (const a of analisis.ausentes || []) {
      if (!quierenQuitar.has(Number(a.id))) continue;
      const [[p]] = await conn.query("SELECT * FROM productos WHERE id = ? FOR UPDATE", [a.id]);
      if (!p) {
        saltados.push(`${a.codigo}: ya no existe`);
        continue;
      }
      await conn.query("INSERT INTO precios_quitados (carga_id, producto_id, datos) VALUES (?,?,?)", [cargaId, p.id, JSON.stringify(p)]);
      await conn.query("DELETE FROM productos WHERE id = ?", [p.id]);
      quitados++;
    }
    await conn.query("UPDATE precios_cargas SET estado = 'APLICADA', actualizados = ?, nuevos = ?, aplicada_en = NOW(), usuario = COALESCE(?, usuario) WHERE id = ?", [actualizados, creados, usuario || null, cargaId]);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  return { ok: true, actualizados, nuevos: creados, quitados, saltados };
}

/** Deshace los precios de una carga (solo si el producto sigue con el precio que puso la carga). No borra productos nuevos. */
async function deshacerCarga(db, cargaId) {
  const [[carga]] = await db.query("SELECT id, estado FROM precios_cargas WHERE id = ?", [cargaId]);
  if (!carga) return { error: "No encontré esa carga.", status: 404 };
  if (carga.estado !== "APLICADA") return { error: "Esa carga no está aplicada.", status: 409 };
  const [[ultima]] = await db.query("SELECT id FROM precios_cargas WHERE estado = 'APLICADA' ORDER BY id DESC LIMIT 1");
  if (ultima.id !== carga.id) return { error: "Solo se puede deshacer la última carga aplicada.", status: 409 };
  const [filas] = await db.query("SELECT producto_id, precio_anterior, precio_nuevo FROM precios_historial WHERE carga_id = ? AND precio_anterior IS NOT NULL", [cargaId]);
  let revertidos = 0;
  const conservados = [];
  for (const f of filas) {
    const [r] = await db.query("UPDATE productos SET precio_lista = ?, precio_actualizado = NOW(), updated_at = NOW() WHERE id = ? AND precio_lista = ?", [f.precio_anterior, f.producto_id, f.precio_nuevo]);
    if (r.affectedRows) revertidos++;
    else conservados.push(f.producto_id);
  }
  // Vuelve a crear los productos que se habían quitado (con su ficha completa).
  const [quitadas] = await db.query("SELECT datos FROM precios_quitados WHERE carga_id = ?", [cargaId]);
  let restaurados = 0;
  for (const q of quitadas) {
    try {
      const d = JSON.parse(q.datos);
      const [[ya]] = await db.query("SELECT id FROM productos WHERE id = ? OR codigo = ?", [d.id, d.codigo]);
      if (ya) continue;
      const cols = Object.keys(d);
      const vals = cols.map((c) => (typeof d[c] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(d[c]) ? new Date(d[c]) : d[c]));
      await db.query(`INSERT INTO productos (${cols.map((c) => "`" + c + "`").join(",")}) VALUES (${cols.map(() => "?").join(",")})`, vals);
      restaurados++;
    } catch (e) {
      console.error("[precios] restaurar:", e.message);
    }
  }
  await db.query("DELETE FROM precios_quitados WHERE carga_id = ?", [cargaId]);
  await db.query("UPDATE precios_cargas SET estado = 'DESHECHA', deshecha_en = NOW() WHERE id = ?", [cargaId]);
  return { ok: true, revertidos, conservados: conservados.length, restaurados };
}

// ---------- lectura con IA ----------
const PROMPT_LISTA = `Esto es la lista de precios mensual de Conoflex Argentina (productos plásticos de seguridad vial). Cada producto tiene un código (puede decir "Código: 1570L-2R NA"), un nombre, a veces medidas y UNO O VARIOS precios en pesos.

Devolvé SOLO un JSON con esta forma, sin texto extra:
{"productos":[{"codigo":"1570L-2R NA","nombre":"KING CONE LIGHT PVC FLEXIBLE CON MEMORIA","medidas":"Base: 26x26cm. Reflectivo: 1x10cm y 1x5cm.","precios":[{"etiqueta":"","valor":35210.07}],"nota":""}]}

Reglas estrictas:
- Incluí TODOS los productos de TODAS las páginas, uno por código. No omitas ni inventes ninguno.
- "valor" es un NÚMERO en pesos (35210.07), copiado exactamente como figura: no redondees, no conviertas ni calcules nada. Los precios usan punto de miles y coma decimal: "$35.210,07" es 35210.07.
- Si un producto tiene varios precios según variante (por ejemplo "SIN FIJACIÓN" y "HORMIGÓN", o por medida), poné un objeto por precio en "precios" con la etiqueta tal cual figura. Si tiene un solo precio, "etiqueta" va vacía.
- Si el precio aclara la unidad ("x metro", "por par", "por rollo"), ponelo en "nota" (ej: "x metro"). Si no aclara nada, "nota" va vacía.
- Si un producto no tiene precio, omitilo.
- No incluyas textos de garantía, condiciones ni encabezados como productos.`;

/** Lee un archivo de lista de precios. `leerExcel(path)` devuelve el texto con "Cód:/Nombre:/Precio Lista:". */
async function leerListaDeArchivo({ ai, archivo, leerExcel, modelo = "gemini-2.5-flash" }) {
  const nombre = String(archivo.originalname || "").toLowerCase();
  const ext = nombre.slice(nombre.lastIndexOf("."));
  if (ext === ".xlsx" || ext === ".xls") {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const tmp = path.join(os.tmpdir(), `lista_${Date.now()}${ext}`);
    fs.writeFileSync(tmp, archivo.buffer);
    try {
      return { productos: parsearTextoCatalogo(leerExcel(tmp)), via: "excel" };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  let contents;
  if (ext === ".pdf") {
    const up = await ai.files.upload({ file: new Blob([archivo.buffer], { type: "application/pdf" }), config: { mimeType: "application/pdf" } });
    const uri = up.uri || up.file?.uri;
    contents = [{ fileData: { fileUri: uri, mimeType: "application/pdf" } }, PROMPT_LISTA];
  } else if ([".csv", ".txt"].includes(ext)) {
    contents = [`TEXTO:\n${archivo.buffer.toString("utf-8")}`, PROMPT_LISTA];
  } else {
    const e = new Error("Subí un PDF, Excel (.xlsx/.xls), CSV o TXT.");
    e.status = 400;
    throw e;
  }
  const r = await ai.models.generateContent({ model: modelo, contents, config: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 65000, thinkingConfig: { thinkingBudget: 0 } } });
  return { productos: parsearJsonProductos(r.text), via: "ia" };
}

// ---------- rutas ----------
function registrarRutasPrecios(app, { db, ai, multer, autenticarToken, autorizarRoles, leerExcel }) {
  const permiso = [autenticarToken, autorizarRoles("ADMIN", "COMERCIAL")];
  const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single("lista");
  const quien = async (req) => (await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user?.id]).then((r) => r[0][0]?.nombre).catch(() => null)) || null;
  let analizando = false;

  // Paso 1: leer el archivo y mostrar qué cambiaría. No modifica ningún producto.
  app.post("/api/comercial/precios/analizar", ...permiso, subir, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });
    if (analizando) return res.status(429).json({ error: "Ya estoy leyendo una lista, esperá a que termine." });
    analizando = true;
    try {
      const leido = await leerListaDeArchivo({ ai, archivo: req.file, leerExcel });
      const { productos: extraidos, descartados } = normalizarExtraidos(leido.productos);
      if (!extraidos.length) return res.status(422).json({ error: "No encontré productos con código y precio en ese archivo. Revisá que sea la lista de precios." });
      const [productos] = await db.query("SELECT id, codigo, nombre, precio_lista FROM productos");
      const cmp = compararLista({ extraidos, productos });
      const analisis = { ...cmp, extraidos: extraidos.length, descartados, via: leido.via };
      const id = await guardarAnalisis(db, { archivo: req.file.originalname, usuario: await quien(req), analisis });
      res.json({ id, archivo: req.file.originalname, productos_en_sistema: productos.length, ...analisis, tildados: analisis.cambios.filter(tildadoPorDefecto).map((c) => c.id) });
    } catch (e) {
      console.error("[precios] analizar:", e.message);
      res.status(e.status || 500).json({ error: e.status === 400 ? e.message : "No pude leer la lista. Probá de nuevo o subila en otro formato (Excel o PDF)." });
    } finally {
      analizando = false;
    }
  });

  // Paso 2: aplicar lo que la persona confirmó. Solo cambia precios.
  app.post("/api/comercial/precios/:id/aplicar", ...permiso, async (req, res) => {
    try {
      const b = req.body || {};
      const r = await aplicarCarga(db, { cargaId: Number(req.params.id), ids: Array.isArray(b.ids) ? b.ids : [], nuevos: Array.isArray(b.nuevos) ? b.nuevos : [], quitar: Array.isArray(b.quitar) ? b.quitar : [], usuario: await quien(req) });
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[precios] aplicar:", e.message);
      res.status(500).json({ error: "No pude aplicar los precios. No se cambió nada." });
    }
  });

  app.post("/api/comercial/precios/:id/deshacer", ...permiso, async (req, res) => {
    try {
      const r = await deshacerCarga(db, Number(req.params.id));
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[precios] deshacer:", e.message);
      res.status(500).json({ error: "No pude deshacer la carga." });
    }
  });

  app.get("/api/comercial/precios/cargas", ...permiso, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT id, archivo, estado, usuario, actualizados, nuevos, created_at, aplicada_en FROM precios_cargas WHERE estado IN ('APLICADA','DESHECHA') ORDER BY id DESC LIMIT 24");
      res.json({ cargas: rows });
    } catch (e) {
      res.status(500).json({ error: "No pude cargar el historial." });
    }
  });

  app.get("/api/comercial/precios/historial/:productoId", ...permiso, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT precio_anterior, precio_nuevo, created_at FROM precios_historial WHERE producto_id = ? ORDER BY id DESC LIMIT 24", [req.params.productoId]);
      res.json({ historial: rows });
    } catch (e) {
      res.status(500).json({ error: "No pude cargar el historial del producto." });
    }
  });
}

module.exports = { textoPrecio, parsearJsonProductos, normalizarExtraidos, parsearTextoCatalogo, compararLista, tildadoPorDefecto, asegurarTablasPrecios, guardarAnalisis, aplicarCarga, deshacerCarga, leerListaDeArchivo, registrarRutasPrecios, pesos, PROMPT_LISTA };
